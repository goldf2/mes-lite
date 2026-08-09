import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const sourceRoot = process.cwd()
const requiredModuleFiles = [
  'modules/production/client/flow-transfer-api.ts',
  'modules/production/contracts/flow-transfer.ts',
  'modules/production/model/flow-transfer-view.ts',
  'modules/production/ui/FlowTransferPageModule.tsx',
]
for (const path of requiredModuleFiles) assert.ok(existsSync(join(sourceRoot, path)), `生产领域缺少流程转移模块文件：${path}`)
const pageSource = readFileSync(join(sourceRoot, 'modules/production/ui/FlowTransferPageModule.tsx'), 'utf8')
const registrySource = readFileSync(join(sourceRoot, 'app/components/shell/WorkspacePageRendererRegistry.tsx'), 'utf8')
assert.ok(pageSource.split('\n').length <= 520, '流程转移协调页应保持在 520 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '流程转移页不得直接调用 fetch')
assert.match(pageSource, /loadFlowTransfers\(/, '流程转移页必须通过生产领域 client 读取数据')
assert.match(registrySource, /FlowTransferPageModule/, '流程转移页必须通过生产模块公开入口加载')

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-flow-transfer-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const { postInventoryLocationTransfer, postInventoryReceipt } = await import('../lib/inventory')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [source, target] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `SOURCE-${suffix}`, name: '待检库位' } }),
      prisma.inventoryLocation.create({ data: { code: `TARGET-${suffix}`, name: '合格库位' } }),
    ])
    const [material, employee] = await Promise.all([
      prisma.material.create({
        data: {
          code: `FLOW-${suffix}`,
          name: '流程转移验证物料',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: 'kg',
          conversionRate: 0.5,
        },
      }),
      prisma.employee.create({
        data: { code: `EMP-${suffix}`, name: '验证员' },
      }),
    ])

    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: material.id,
      stockQty: 100,
      valuationQty: 50,
      costAmount: 500,
      type: 'VERIFY_IN',
      refType: 'VERIFY',
      refId: 'opening',
      note: '验证期初入库',
      locationId: source.id,
    }))

    const { resolveFlowTransferDraft } = await import('../lib/flow-transfer')
    const draftInput = {
      transferDate: '2026-08-03',
      materialId: material.id,
      sourceLocationId: source.id,
      targetLocationId: target.id,
      quantity: 25,
      employeeId: employee.id,
    }
    await prisma.$transaction((tx) => resolveFlowTransferDraft(tx, draftInput))
    await assert.rejects(
      prisma.$transaction((tx) => resolveFlowTransferDraft(tx, { ...draftInput, quantity: 101 })),
      /库存不足/,
      '保存流程转移草稿时应拒绝超过来源库位可用量的数量',
    )

    const stockBefore = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    const layersBefore = await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } })
    const transfer = await prisma.flowTransfer.create({
      data: {
        transferNo: `FT-${suffix}`,
        transferDate: new Date(),
        materialId: material.id,
        sourceLocationId: source.id,
        targetLocationId: target.id,
        quantity: 25,
        unit: '件',
        operator: '验证员',
      },
    })

    await prisma.$transaction(async (tx) => {
      await postInventoryLocationTransfer(tx, {
        materialId: material.id,
        stockQty: 25,
        sourceLocationId: source.id,
        targetLocationId: target.id,
        refId: transfer.id,
        note: '待检转合格',
        createdBy: '验证员',
      })
      await tx.flowTransfer.update({
        where: { id: transfer.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: '验证员' },
      })
    })

    const stockAfterTransfer = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    const layersAfterTransfer = await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } })
    assert.deepEqual(
      [stockAfterTransfer.qty, stockAfterTransfer.availableQty, stockAfterTransfer.valuationQty, stockAfterTransfer.totalCost],
      [stockBefore.qty, stockBefore.availableQty, stockBefore.valuationQty, stockBefore.totalCost],
      '转移不应改变总库存、计价数量和总成本',
    )
    assert.deepEqual(layersAfterTransfer, layersBefore, '转移不应改变成本层')

    const balancesAfterTransfer = await prisma.stockLocationBalance.findMany({ where: { stockId: stockBefore.id } })
    const qtyAt = (balances: typeof balancesAfterTransfer, locationId: string) => Number(
      balances.find((balance) => balance.locationId === locationId)?.qty || 0,
    )
    assert.equal(qtyAt(balancesAfterTransfer, source.id), 75)
    assert.equal(qtyAt(balancesAfterTransfer, target.id), 25)

    const logs = await prisma.stockLog.findMany({ where: { refType: 'FLOW_TRANSFER', refId: transfer.id }, orderBy: { createdAt: 'asc' } })
    assert.deepEqual(logs.map((log) => [log.type, log.qty, log.beforeQty, log.afterQty, log.costAmount]), [
      ['FLOW_TRANSFER_OUT', -25, 100, 100, 0],
      ['FLOW_TRANSFER_IN', 25, 100, 100, 0],
    ])

    await assert.rejects(
      prisma.$transaction((tx) => postInventoryLocationTransfer(tx, {
        materialId: material.id,
        stockQty: 26,
        sourceLocationId: target.id,
        targetLocationId: source.id,
        refId: transfer.id,
        note: '验证超量冲销',
        reverse: true,
      })),
      /库存不足/,
    )
    const balancesAfterRejectedReverse = await prisma.stockLocationBalance.findMany({ where: { stockId: stockBefore.id } })
    assert.equal(qtyAt(balancesAfterRejectedReverse, source.id), 75, '失败的冲销不应留下部分变动')
    assert.equal(qtyAt(balancesAfterRejectedReverse, target.id), 25)

    await prisma.$transaction(async (tx) => {
      await postInventoryLocationTransfer(tx, {
        materialId: material.id,
        stockQty: 25,
        sourceLocationId: target.id,
        targetLocationId: source.id,
        refId: transfer.id,
        note: '冲销验证',
        createdBy: '验证员',
        reverse: true,
      })
      await tx.flowTransfer.update({
        where: { id: transfer.id },
        data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: '验证员', reverseReason: '验证' },
      })
    })

    const balancesAfterReverse = await prisma.stockLocationBalance.findMany({ where: { stockId: stockBefore.id } })
    const stockAfterReverse = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    const layersAfterReverse = await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } })
    assert.equal(qtyAt(balancesAfterReverse, source.id), 100)
    assert.equal(qtyAt(balancesAfterReverse, target.id), 0)
    assert.deepEqual(
      [stockAfterReverse.qty, stockAfterReverse.availableQty, stockAfterReverse.valuationQty, stockAfterReverse.totalCost],
      [stockBefore.qty, stockBefore.availableQty, stockBefore.valuationQty, stockBefore.totalCost],
    )
    assert.deepEqual(layersAfterReverse, layersBefore)

    console.log('流程转移同物料、同数量、异库位、总库存/总成本不变及冲销验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
