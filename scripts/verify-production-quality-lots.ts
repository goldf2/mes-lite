import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-production-quality-lots-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function close(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) <= 0.000001, `${label}: expected ${expected}, got ${actual}`)
}

async function main() {
  const [
    { prisma },
    { postInventoryIssue, postInventoryReceipt },
    { confirmProductionOrderActual, reverseProductionOrderActual },
    { decideQualityInspection },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/production/server/production-order-actual-status-service'),
    import('../modules/quality/server/quality-inspection-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [inputLocation, outputLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `QL-IN-${suffix}`, name: '质量闭环原料库位' } }),
      prisma.inventoryLocation.create({ data: { code: `QL-OUT-${suffix}`, name: '质量闭环产出库位' } }),
    ])
    const [raw, releasedFinished, heldFinished] = await Promise.all([
      prisma.material.create({ data: { code: `QL-RAW-${suffix}`, name: '质量闭环原料', category: 'RAW', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `QL-PASS-${suffix}`, name: '待放行成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `QL-HOLD-${suffix}`, name: '待冻结成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const [releasedProduct, heldProduct] = await Promise.all([
      prisma.product.create({ data: { sku: `QL-PASS-${suffix}`, materialId: releasedFinished.id, name: releasedFinished.name, category: 'FINISHED', unit: '件' } }),
      prisma.product.create({ data: { sku: `QL-HOLD-${suffix}`, materialId: heldFinished.id, name: heldFinished.name, category: 'FINISHED', unit: '件' } }),
    ])

    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, {
        materialId: raw.id, stockQty: 10, valuationQty: 10, costAmount: 100,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: 'raw-opening', note: '质量闭环原料期初',
        locationId: inputLocation.id,
      })
      await postInventoryReceipt(tx, {
        materialId: releasedFinished.id, stockQty: 10, valuationQty: 10, costAmount: 100,
        type: 'VERIFY_IN', refType: 'VERIFY', refId: 'finished-opening', note: '质量闭环成品期初',
        locationId: outputLocation.id,
      })
    })

    const createActual = async (input: {
      actualNo: string
      orderNo: string
      productId: string
      materialId: string
      outputQty: number
      inputQty: number
    }) => {
      const order = await prisma.productionOrder.create({
        data: {
          orderNo: input.orderNo,
          productId: input.productId,
          materialId: input.materialId,
          planQty: input.outputQty,
          status: 'RELEASED',
        },
      })
      return prisma.productionOrderActual.create({
        data: {
          actualNo: input.actualNo,
          orderId: order.id,
          actualDate: new Date('2026-08-12T00:00:00.000Z'),
          workers: '质量闭环验证员',
          inputs: {
            create: {
              materialId: raw.id, locationId: inputLocation.id,
              materialCode: raw.code, materialName: raw.name,
              quantityPerBatch: 1, plannedQty: input.inputQty, actualQty: input.inputQty, unit: '件',
            },
          },
          outputs: {
            create: {
              materialId: input.materialId, locationId: outputLocation.id,
              materialCode: input.materialId === releasedFinished.id ? releasedFinished.code : heldFinished.code,
              materialName: input.materialId === releasedFinished.id ? releasedFinished.name : heldFinished.name,
              quantityPerBatch: 1, plannedQty: input.outputQty, actualQty: input.outputQty, unit: '件', isPrimary: true,
            },
          },
        },
        include: { outputs: true },
      })
    }

    const passActual = await createActual({
      actualNo: `PA-QL-PASS-${suffix}`, orderNo: `WO-QL-PASS-${suffix}`,
      productId: releasedProduct.id, materialId: releasedFinished.id, outputQty: 4, inputQty: 4,
    })
    await confirmProductionOrderActual(passActual.orderId, passActual.id, '生产确认员')

    const passOutput = await prisma.productionOrderActualOutput.findUniqueOrThrow({
      where: { id: passActual.outputs[0].id },
      include: { inventoryLot: { include: { balances: true, inspections: true } } },
    })
    assert.ok(passOutput.inventoryLot, '生产产出必须生成内部批次')
    assert.equal(passOutput.inventoryLot.status, 'OPEN')
    assert.equal(passOutput.inventoryLot.inspections[0]?.status, 'PENDING', '产出批次必须生成待检任务')
    assert.equal(passOutput.inventoryLot.balances[0]?.inventoryStatus, 'QUARANTINE')
    close(Number(passOutput.inventoryLot.balances[0]?.stockQty), 4, '待检批次数量')

    const quarantinedStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: releasedFinished.id } })
    close(Number(quarantinedStock.qty), 14, '待检入库后总库存')
    close(Number(quarantinedStock.availableQty), 10, '待检入库后可用库存不得增加')
    close(Number(quarantinedStock.quarantineQty), 4, '待检库存')
    close(Number(quarantinedStock.quarantineCost), 40, '待检成本')

    const issueBeforeRelease = await prisma.$transaction((tx) => postInventoryIssue(tx, {
      materialId: releasedFinished.id, stockQty: 2,
      type: 'VERIFY_OUT', refType: 'VERIFY', refId: 'before-release', note: '验证待检成本隔离',
      locationId: outputLocation.id,
    }))
    close(Number(issueBeforeRelease.costAmount), 20, '待检成本不得混入可用库存加权成本')

    const passInspection = passOutput.inventoryLot.inspections[0]!
    await decideQualityInspection(passInspection.id, {
      decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: '抽检合格',
    }, '质量检验员')
    const releasedStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: releasedFinished.id } })
    close(Number(releasedStock.qty), 12, '放行后总库存')
    close(Number(releasedStock.availableQty), 12, '放行后可用库存')
    close(Number(releasedStock.quarantineQty), 0, '放行后待检库存')
    close(Number(releasedStock.quarantineCost), 0, '放行后待检成本')
    const releasedLayer = await prisma.inventoryCostLayer.findFirstOrThrow({ where: { lotId: passOutput.inventoryLot.id } })
    assert.equal(releasedLayer.inventoryStatus, 'AVAILABLE', '放行必须同步开放成本层')
    await assert.rejects(
      () => reverseProductionOrderActual(passActual.orderId, passActual.id, { reason: '已放行后尝试冲销' }, '冲销员'),
      /已放行/,
      '已放行批次在尚未实现批次消耗分配前必须拒绝直接冲销',
    )

    const holdActual = await createActual({
      actualNo: `PA-QL-HOLD-${suffix}`, orderNo: `WO-QL-HOLD-${suffix}`,
      productId: heldProduct.id, materialId: heldFinished.id, outputQty: 2, inputQty: 2,
    })
    await confirmProductionOrderActual(holdActual.orderId, holdActual.id, '生产确认员')
    const holdOutput = await prisma.productionOrderActualOutput.findUniqueOrThrow({
      where: { id: holdActual.outputs[0].id },
      include: { inventoryLot: { include: { balances: true, inspections: true } } },
    })
    await decideQualityInspection(holdOutput.inventoryLot!.inspections[0]!.id, {
      decision: 'FAIL', sampleQty: 2, goodQty: 0, badQty: 2, note: '尺寸超差，整批冻结',
    }, '质量检验员')
    const heldStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: heldFinished.id } })
    close(Number(heldStock.qty), 2, '冻结后总库存')
    close(Number(heldStock.availableQty), 0, '冻结库存不可用')
    close(Number(heldStock.holdQty), 2, '冻结库存')
    await assert.rejects(
      () => prisma.$transaction((tx) => postInventoryIssue(tx, {
        materialId: heldFinished.id, stockQty: 1,
        type: 'VERIFY_OUT', refType: 'VERIFY', refId: 'held-output', note: '验证冻结不可出库',
        locationId: outputLocation.id,
      })),
      /库存不足/,
    )

    await reverseProductionOrderActual(holdActual.orderId, holdActual.id, { reason: '冻结批次整笔冲销' }, '冲销员')
    const [reversedHeldStock, reversedHeldLot, reversedInspection, restoredRaw] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: heldFinished.id } }),
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: holdOutput.inventoryLot!.id } }),
      prisma.qualityInspection.findUniqueOrThrow({ where: { id: holdOutput.inventoryLot!.inspections[0]!.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: raw.id } }),
    ])
    close(Number(reversedHeldStock.qty), 0, '冻结批次冲销后产出库存')
    close(Number(reversedHeldStock.holdQty), 0, '冻结批次冲销后冻结库存')
    assert.equal(reversedHeldLot.status, 'REVERSED')
    assert.equal(reversedInspection.status, 'REVERSED')
    close(Number(restoredRaw.qty), 6, '两次实绩后冲销第二次投入的原料余额')

    const lotTransactions = await prisma.inventoryLotTransaction.count({
      where: { lotId: { in: [passOutput.inventoryLot.id, holdOutput.inventoryLot!.id] } },
    })
    assert.equal(lotTransactions, 5, '两批应形成入库、质量状态转换和冻结批次冲销共五条批次交易')
    console.log('生产质量批次闭环验证通过：待检隔离、成本隔离、合格放行、不合格冻结、不可出库与冻结批次冲销均符合预期。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
