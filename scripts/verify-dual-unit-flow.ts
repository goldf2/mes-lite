import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { postInventoryIssue, postInventoryReceipt } from '../lib/inventory'

const prisma = new PrismaClient()
const close = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(actual - expected) <= 0.000001, `${message}: expected ${expected}, received ${actual}`)
}

async function main() {
  const suffix = Date.now().toString()
  const raw = await prisma.material.create({
    data: {
      code: `VERIFY-RAW-${suffix}`,
      name: '双单位验证原料',
      category: 'RAW',
      unit: '米',
      stockUnit: '米',
      valuationUnit: 'kg',
      conversionRate: 0.785,
      conversionNote: '回归测试',
      unitMode: 'DUAL',
      costingMethod: 'FIFO',
      stock: { create: {} },
    },
  })
  const finished = await prisma.material.create({
    data: {
      code: `VERIFY-FIN-${suffix}`,
      name: '双单位验证成品',
      category: 'FINISHED',
      unit: '件',
      stockUnit: '件',
      valuationUnit: '件',
      conversionRate: 1,
      unitMode: 'SINGLE',
      costingMethod: 'FIFO',
      stock: { create: {} },
    },
  })

  try {
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: raw.id,
      stockQty: 120,
      valuationQty: 95,
      conversionSource: 'DOCUMENT_ACTUAL',
      costAmount: 760,
      type: 'IN',
      refType: 'VERIFY',
      refId: `${suffix}-IN-1`,
      note: '第一批来料',
      idempotencyKey: `${suffix}:IN:1`,
    }))
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: raw.id,
      stockQty: 45,
      valuationQty: 34.5,
      conversionSource: 'DOCUMENT_ACTUAL',
      costAmount: 282.9,
      type: 'IN',
      refType: 'VERIFY',
      refId: `${suffix}-IN-2`,
      note: '第二批来料',
      idempotencyKey: `${suffix}:IN:2`,
    }))

    let rawStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: raw.id } })
    close(Number(rawStock.qty), 165, '来料后库存数量')
    close(Number(rawStock.valuationQty), 129.5, '来料后核算数量')
    close(Number(rawStock.totalCost), 1042.9, '来料后库存金额')

    const consumed = await prisma.$transaction((tx) => postInventoryIssue(tx, {
      materialId: raw.id,
      stockQty: 36.75,
      type: 'PRODUCTION_CONSUME',
      refType: 'VERIFY',
      refId: `${suffix}-PRODUCTION`,
      note: '生产耗料',
      idempotencyKey: `${suffix}:PRODUCTION:RAW`,
    }))
    close(Number(consumed.valuationQty), 29.09375, 'FIFO 核算耗用')
    close(Number(consumed.costAmount), 232.75, 'FIFO 耗用成本')

    rawStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: raw.id } })
    close(Number(rawStock.qty), 128.25, '生产后原料库存')
    close(Number(rawStock.valuationQty), 100.40625, '生产后原料核算库存')
    close(Number(rawStock.totalCost), 810.15, '生产后原料金额')

    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: finished.id,
      stockQty: 96,
      valuationQty: 96,
      conversionSource: 'MASTER_DEFAULT',
      costAmount: Number(consumed.costAmount),
      type: 'PRODUCTION_IN',
      refType: 'VERIFY',
      refId: `${suffix}-PRODUCTION`,
      note: '合格品入库',
      idempotencyKey: `${suffix}:PRODUCTION:OUTPUT`,
    }))
    const shipped = await prisma.$transaction((tx) => postInventoryIssue(tx, {
      materialId: finished.id,
      stockQty: 20.5,
      type: 'OUT',
      refType: 'VERIFY',
      refId: `${suffix}-SHIPMENT`,
      note: '成品发货',
      idempotencyKey: `${suffix}:SHIPMENT`,
    }))
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: finished.id,
      stockQty: 3.25,
      valuationQty: Number(shipped.valuationQty) * 3.25 / 20.5,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costAmount: Number(shipped.costAmount) * 3.25 / 20.5,
      type: 'RETURN_IN',
      refType: 'VERIFY',
      refId: `${suffix}-RETURN`,
      note: '部分退货',
      sourceMovementId: shipped.movement.id,
      idempotencyKey: `${suffix}:RETURN`,
    }))

    const finishedStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: finished.id } })
    close(Number(finishedStock.qty), 78.75, '发货退货后成品库存')
    close(Number(finishedStock.valuationQty), 78.75, '发货退货后成品核算库存')

    const locationBalances = await prisma.stockLocationBalance.findMany({
      where: { stockId: { in: [rawStock.id, finishedStock.id] } },
      include: { location: true },
    })
    const rawLocationQty = locationBalances
      .filter((item) => item.stockId === rawStock.id)
      .reduce((sum, item) => sum + Number(item.qty), 0)
    const finishedLocationQty = locationBalances
      .filter((item) => item.stockId === finishedStock.id)
      .reduce((sum, item) => sum + Number(item.qty), 0)
    close(rawLocationQty, Number(rawStock.qty), '原料库位合计')
    close(finishedLocationQty, Number(finishedStock.qty), '成品库位合计')
    assert.ok(locationBalances.every((item) => item.location.isActive), '验证流水应进入启用库位')

    const movements = await prisma.stockLog.findMany({
      where: { refType: 'VERIFY', refId: { contains: suffix } },
    })
    assert.ok(movements.length >= 6, '应生成完整库存流水')
    assert.ok(movements.every((item) =>
      item.stockUnitSnapshot
      && item.valuationUnitSnapshot
      && item.conversionSource
      && item.conversionRateUsed !== null
      && item.locationId
    ), '所有新增流水必须保存单位和换算快照')

    console.log('双单位全流程验证通过')
  } finally {
    await prisma.stockLog.deleteMany({ where: { refType: 'VERIFY', refId: { contains: suffix } } })
    await prisma.inventoryCostLayer.deleteMany({ where: { materialId: { in: [raw.id, finished.id] } } })
    await prisma.stock.deleteMany({ where: { materialId: { in: [raw.id, finished.id] } } })
    await prisma.material.deleteMany({ where: { id: { in: [raw.id, finished.id] } } })
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
