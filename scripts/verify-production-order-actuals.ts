import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-production-actual-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { buildProductionOrderActualLines },
    { createProductionOrderActual, deleteProductionOrderActualDraft, getProductionOrderActualWorkspace },
    { confirmProductionOrderActual, reverseProductionOrderActual },
    { ProductionOrderDomainError },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/production/server/production-order-actual-lines'),
    import('../modules/production/server/production-order-actual-service'),
    import('../modules/production/server/production-order-actual-status-service'),
    import('../modules/production/domain/production-order-errors'),
  ])
  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [inputLocation, outputLocation, scrapLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `INPUT-${suffix}`, name: '半成品库位' } }),
      prisma.inventoryLocation.create({ data: { code: `OUTPUT-${suffix}`, name: '成品库位' } }),
      prisma.inventoryLocation.create({ data: { code: `SCRAP-${suffix}`, name: '废料库位' } }),
    ])
    const [existingProduct, finished, scrap, employee] = await Promise.all([
      prisma.material.create({ data: { code: `OLD-${suffix}`, name: '待二次加工产品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `NEW-${suffix}`, name: '二次加工后产品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `SCRAP-${suffix}`, name: '加工废料', category: 'SCRAP', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
      prisma.employee.create({ data: { code: `EMP-${suffix}`, name: '验证生产员', department: '生产部' } }),
    ])
    const product = await prisma.product.create({
      data: { sku: `MAT-${finished.code}`, name: finished.name, category: finished.category, unit: finished.stockUnit },
    })
    const bom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '二次加工方案',
        version: 'v1',
        outputQuantity: 1,
        outputUnit: '件',
        items: {
          create: { materialId: existingProduct.id, outputMaterialId: null, itemType: 'MATERIAL', quantity: 2.5, unit: '件' },
        },
        outputs: {
          create: [
            { materialId: finished.id, quantity: 1, unit: '件', isPrimary: true },
            { materialId: scrap.id, quantity: 0.1, unit: 'kg', isPrimary: false },
          ],
        },
      },
      include: {
        items: { include: { material: { select: { code: true, name: true, stockUnit: true, unit: true } } } },
        outputs: { include: { material: { select: { code: true, name: true, stockUnit: true, unit: true } } } },
      },
    })
    const snapshot = JSON.stringify(bom)
    const order = await prisma.productionOrder.create({
      data: {
        orderNo: `WO-${suffix}`,
        productId: product.id,
        materialId: finished.id,
        bomId: bom.id,
        bomName: bom.name,
        bomVersion: bom.version,
        bomSnapshot: snapshot,
        planQty: 5,
      },
    })

    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: existingProduct.id,
      stockQty: 20,
      valuationQty: 20,
      costAmount: 200,
      type: 'VERIFY_IN',
      refType: 'VERIFY',
      refId: 'opening',
      note: '验证二次加工投入期初库存',
      locationId: inputLocation.id,
    }))

    const lines = await prisma.$transaction((tx) => buildProductionOrderActualLines(
      tx,
      snapshot,
      [{
        materialId: existingProduct.id,
        locationId: inputLocation.id,
        lossMode: 'FIXED_PER_UNIT',
        lossValue: 0.2,
      }],
      [
        { materialId: finished.id, locationId: outputLocation.id, actualQty: 3 },
        { materialId: scrap.id, locationId: scrapLocation.id, actualQty: 0.25 },
      ],
    ))

    assert.equal(lines.inputs[0].materialId, existingProduct.id, '成品类别物料应可作为二次加工投入')
    assert.equal(lines.inputs.length, 1, '整批共同投入应只生成一条领料明细')
    assert.equal(lines.inputs[0].quantityPerBatch, 2.5)
    assert.equal(lines.inputs[0].plannedQty, 8.1)
    assert.equal(lines.inputs[0].lossQty, 0.6)
    assert.equal(lines.inputs[0].actualQty, 8.1)
    assert.equal(lines.outputs.find((line) => line.isPrimary)?.actualQty, 3)
    assert.equal(lines.outputs.find((line) => line.materialId === scrap.id)?.actualQty, 0.25)

    const actualInput = {
      actualDate: '2026-08-09',
      employeeIds: [employee.id],
      note: '验证班后生产实绩',
      inputs: [{
        materialId: existingProduct.id,
        locationId: inputLocation.id,
        lossMode: 'FIXED_PER_UNIT' as const,
        lossValue: 0.2,
      }],
      outputs: [
        { materialId: finished.id, locationId: outputLocation.id, actualQty: 3 },
        { materialId: scrap.id, locationId: scrapLocation.id, actualQty: 0.25 },
      ],
    }
    const actual = await createProductionOrderActual(order.id, actualInput)
    assert.equal(actual.status, 'DRAFT')
    assert.equal(actual.actualNo, 'PA-20260809-001')
    assert.equal(actual.workers, '验证生产员')
    const workspace = await getProductionOrderActualWorkspace(order.id)
    assert.equal(workspace.order.actuals[0].id, actual.id, '实绩工作区必须返回新建草稿和候选项')
    await assert.rejects(
      () => deleteProductionOrderActualDraft(order.id, 'missing-actual'),
      ProductionOrderDomainError,
      '删除不存在的实绩必须返回领域错误',
    )

    const confirmed = await confirmProductionOrderActual(order.id, actual.id, '验证确认员')
    assert.equal(confirmed.before.status, 'DRAFT')
    assert.equal(confirmed.updated.status, 'CONFIRMED')
    await assert.rejects(
      () => confirmProductionOrderActual(order.id, actual.id, '重复确认员'),
      ProductionOrderDomainError,
      '已确认实绩不得重复确认',
    )

    const [inputStock, outputStock, scrapStock, updatedOrder] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: existingProduct.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: finished.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: scrap.id } }),
      prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ])
    assert.equal(inputStock.qty, 11.9)
    assert.equal(outputStock.qty, 3)
    assert.equal(outputStock.totalCost, 81)
    assert.equal(scrapStock.qty, 0.25)
    assert.equal(updatedOrder.completeQty, 3)
    assert.equal(updatedOrder.scrapQty, 0.25)
    assert.equal(updatedOrder.status, 'RUNNING')

    const reversed = await reverseProductionOrderActual(order.id, actual.id, { reason: '验证冲销', reversedBy: '验证冲销员' })
    assert.equal(reversed.before.status, 'CONFIRMED')
    assert.equal(reversed.updated.status, 'REVERSED')
    const [restoredInput, reversedOutput, reversedScrap, resetOrder, reversalLogs] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: existingProduct.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: finished.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: scrap.id } }),
      prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.stockLog.count({ where: { refType: 'PRODUCTION_ORDER_ACTUAL_REVERSE', refId: actual.id } }),
    ])
    assert.deepEqual([restoredInput.qty, restoredInput.totalCost], [20, 200], '冲销必须恢复投入库存和原成本')
    assert.deepEqual([reversedOutput.qty, reversedOutput.totalCost], [0, 0], '冲销必须扣回主产出库存和成本')
    assert.equal(reversedScrap.qty, 0, '冲销必须扣回副产出库存')
    assert.deepEqual([resetOrder.completeQty, resetOrder.scrapQty, resetOrder.status], [0, 0, 'DRAFT'], '冲销后必须重算生产订单累计数量和状态')
    assert.equal(reversalLogs, 3, '一次冲销必须生成一条投入恢复和两条产出扣回流水')
    await assert.rejects(
      () => reverseProductionOrderActual(order.id, actual.id, { reason: '重复冲销', reversedBy: '验证员' }),
      ProductionOrderDomainError,
      '已冲销实绩不得重复冲销',
    )

    const draft = await createProductionOrderActual(order.id, { ...actualInput, outputs: [
      { materialId: finished.id, locationId: outputLocation.id, actualQty: 1 },
      { materialId: scrap.id, locationId: scrapLocation.id, actualQty: 0 },
    ] })
    assert.equal(draft.actualNo, 'PA-20260809-002')
    const laterDraft = await createProductionOrderActual(order.id, { ...actualInput, outputs: [
      { materialId: finished.id, locationId: outputLocation.id, actualQty: 1 },
      { materialId: scrap.id, locationId: scrapLocation.id, actualQty: 0 },
    ] })
    assert.equal(laterDraft.actualNo, 'PA-20260809-003')
    await deleteProductionOrderActualDraft(order.id, draft.id)
    assert.equal(await prisma.productionOrderActual.findUnique({ where: { id: draft.id } }), null, '草稿实绩必须可删除')
    const afterGap = await createProductionOrderActual(order.id, { ...actualInput, outputs: [
      { materialId: finished.id, locationId: outputLocation.id, actualQty: 1 },
      { materialId: scrap.id, locationId: scrapLocation.id, actualQty: 0 },
    ] })
    assert.equal(afterGap.actualNo, 'PA-20260809-004', '删除中间草稿后必须按最大历史序号继续编号，不能与现有实绩撞号')

    console.log('生产实绩垂直模块验证通过：工作区、草稿、确认、冲销、删除、BOM 快照、多产出和库存成本事务符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
