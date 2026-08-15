import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { postInventoryReceipt } from '../lib/inventory'
import { createMaterialIns } from '../modules/receiving/server/material-in-service'
import { receiveManagedMaterialIn, reverseManagedMaterialIn } from '../modules/receiving/server/material-in-status-service'
import { confirmProductionOrderActual, reverseProductionOrderActual } from '../modules/production/server/production-order-actual-status-service'
import { createManagedFlowTransfer } from '../modules/production/server/flow-transfer-command-service'
import { confirmManagedFlowTransfer, reverseManagedFlowTransfer } from '../modules/production/server/flow-transfer-status-service'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-lot-genealogy-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const close = (actual: number, expected: number, label: string) => assert.ok(Math.abs(actual - expected) < 0.000001, `${label}: ${actual} != ${expected}`)

async function main() {
  const suffix = Date.now().toString(36)
  try {
    const [location, productionLocation, supplier, employee] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `LOT-${suffix}`, name: '批次验证库位', isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `WIP-${suffix}`, name: '批次验证生产库位' } }),
      prisma.supplier.create({ data: { code: `SUP-${suffix}`, name: '批次验证供应商' } }),
      prisma.employee.create({ data: { code: `EMP-${suffix}`, name: '批次验证配送员' } }),
    ])
    const [raw, historicalRaw, finished] = await Promise.all([
      prisma.material.create({ data: { code: `RAW-${suffix}`, name: '批次原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', costingMethod: 'FIFO' } }),
      prisma.material.create({ data: { code: `HIS-${suffix}`, name: '历史未追踪原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', costingMethod: 'WEIGHTED_AVERAGE' } }),
      prisma.material.create({ data: { code: `FIN-${suffix}`, name: '批次成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
    ])
    const product = await prisma.product.create({ data: { sku: `FIN-${suffix}`, materialId: finished.id, name: finished.name, category: 'FINISHED', unit: '件' } })

    const firstReceipt = await createMaterialIns({
      supplierId: supplier.id, stagingLocationId: location.id, voucherNo: 'PO-LOT-001',
      items: [{ materialId: raw.id, qty: 5, valuationQty: 5, unitPrice: 10, priceBasis: 'STOCK', batchNo: 'HEAT-A' }],
    }, new Date('2026-08-13T01:00:00.000Z'))
    const secondReceipt = await createMaterialIns({
      supplierId: supplier.id, stagingLocationId: location.id, voucherNo: 'PO-LOT-002',
      items: [{ materialId: raw.id, qty: 7, valuationQty: 7, unitPrice: 12, priceBasis: 'STOCK', batchNo: 'HEAT-B' }],
    }, new Date('2026-08-13T02:00:00.000Z'))
    await receiveManagedMaterialIn(firstReceipt.first.id, '仓管员')
    await receiveManagedMaterialIn(secondReceipt.first.id, '仓管员')

    const receiptLots = await prisma.inventoryLot.findMany({ where: { materialId: raw.id }, include: { balances: true }, orderBy: { receivedAt: 'asc' } })
    assert.equal(receiptLots.length, 2, '两张来料行必须形成两个内部批次')
    assert.deepEqual(receiptLots.map((lot) => lot.supplierLotNo), ['HEAT-A', 'HEAT-B'])
    close(Number(receiptLots[0].balances[0].stockQty), 5, '第一供应批次余额')
    close(Number(receiptLots[1].balances[0].stockQty), 7, '第二供应批次余额')

    const transfer = await createManagedFlowTransfer({
      transferDate: '2026-08-13', materialId: raw.id, sourceLocationId: location.id,
      targetLocationId: productionLocation.id, quantity: 8, employeeId: employee.id, note: '批次验证配送',
    })
    await confirmManagedFlowTransfer(transfer.id, '配送员')
    const transferredLots = await prisma.inventoryLot.findMany({
      where: { id: { in: receiptLots.map((lot) => lot.id) } }, include: { balances: true }, orderBy: { receivedAt: 'asc' },
    })
    close(Number(transferredLots[0].balances.find((item) => item.locationId === productionLocation.id)?.stockQty), 5, '第一供应批次转入生产库位')
    close(Number(transferredLots[1].balances.find((item) => item.locationId === productionLocation.id)?.stockQty), 3, '第二供应批次转入生产库位')

    const order = await prisma.productionOrder.create({ data: { orderNo: `WO-${suffix}`, productId: product.id, materialId: finished.id, planQty: 10, status: 'RELEASED' } })
    const actual = await prisma.productionOrderActual.create({
      data: {
        actualNo: `PA-${suffix}`, orderId: order.id, actualDate: new Date('2026-08-13T03:00:00.000Z'), workers: '生产员',
        equipmentExceptionReason: '批次谱系验证未配置实际设备', workInstructionExceptionReason: '批次谱系验证未配置作业文件',
        inputs: { create: { materialId: raw.id, locationId: productionLocation.id, materialCode: raw.code, materialName: raw.name, quantityPerBatch: 1, plannedQty: 8, actualQty: 8, unit: 'kg' } },
        outputs: { create: { materialId: finished.id, locationId: location.id, materialCode: finished.code, materialName: finished.name, quantityPerBatch: 1, plannedQty: 10, actualQty: 10, unit: '件', isPrimary: true } },
      },
      include: { inputs: true, outputs: true },
    })
    await confirmProductionOrderActual(order.id, actual.id, '生产确认员')
    const allocations = await prisma.inventoryLotAllocation.findMany({ where: { actualInputId: actual.inputs[0].id }, include: { lot: true }, orderBy: { createdAt: 'asc' } })
    assert.equal(allocations.length, 2, '投入 8kg 必须按两个供应批次 FIFO 分配')
    assert.deepEqual(allocations.map((item) => [item.lot.supplierLotNo, Number(item.stockQty)]), [['HEAT-A', 5], ['HEAT-B', 3]])

    const childLot = await prisma.inventoryLot.findUniqueOrThrow({ where: { productionOutputId: actual.outputs[0].id } })
    const genealogies = await prisma.inventoryLotGenealogy.findMany({ where: { childLotId: childLot.id, status: 'ACTIVE' }, include: { parentLot: true } })
    assert.equal(genealogies.length, 2, '产出批次必须关联全部投入批次')
    assert.deepEqual(new Set(genealogies.map((item) => item.parentLot.supplierLotNo)), new Set(['HEAT-A', 'HEAT-B']))
    await assert.rejects(
      () => reverseManagedMaterialIn(firstReceipt.first.id, { reason: '已投入后尝试红冲' }, '仓管员'),
      /已被生产领用|余额变动/,
      '已投入生产的来料批次不得整单红冲',
    )

    await reverseProductionOrderActual(order.id, actual.id, { reason: '验证谱系回滚' }, '生产确认员')
    const [restoredLots, reversedAllocations, reversedGenealogies] = await Promise.all([
      prisma.inventoryLot.findMany({ where: { id: { in: receiptLots.map((lot) => lot.id) } }, include: { balances: true }, orderBy: { receivedAt: 'asc' } }),
      prisma.inventoryLotAllocation.findMany({ where: { actualInputId: actual.inputs[0].id } }),
      prisma.inventoryLotGenealogy.findMany({ where: { actualId: actual.id } }),
    ])
    close(Number(restoredLots[0].balances.find((item) => item.locationId === productionLocation.id && item.inventoryStatus === 'AVAILABLE')?.stockQty), 5, '冲销后第一批在生产库位恢复')
    close(Number(restoredLots[1].balances.find((item) => item.locationId === productionLocation.id && item.inventoryStatus === 'AVAILABLE')?.stockQty), 3, '冲销后第二批在生产库位恢复')
    close(Number(restoredLots[1].balances.find((item) => item.locationId === location.id && item.inventoryStatus === 'AVAILABLE')?.stockQty), 4, '未配送的第二批余额保留在原料库位')
    assert.ok(reversedAllocations.every((item) => item.status === 'REVERSED'), '投入分配必须标记已冲销')
    assert.ok(reversedGenealogies.every((item) => item.status === 'REVERSED'), '谱系边必须标记已冲销')

    await reverseManagedFlowTransfer(transfer.id, { reason: '验证批次配送回滚' }, '配送员')
    const returnedLots = await prisma.inventoryLot.findMany({
      where: { id: { in: receiptLots.map((lot) => lot.id) } }, include: { balances: true }, orderBy: { receivedAt: 'asc' },
    })
    close(Number(returnedLots[0].balances.find((item) => item.locationId === location.id)?.stockQty), 5, '配送冲销后第一批回到原库位')
    close(Number(returnedLots[1].balances.find((item) => item.locationId === location.id)?.stockQty), 7, '配送冲销后第二批回到原库位')

    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, {
        materialId: historicalRaw.id, stockQty: 4, valuationQty: 4, costAmount: 36,
        type: 'OPENING', refType: 'VERIFY', refId: 'legacy-transfer', note: '历史未追踪库存配送', locationId: location.id,
      })
    })
    const legacyTransfer = await createManagedFlowTransfer({
      transferDate: '2026-08-13', materialId: historicalRaw.id, sourceLocationId: location.id,
      targetLocationId: productionLocation.id, quantity: 2, employeeId: employee.id, note: '历史批次配送校验',
    })
    await confirmManagedFlowTransfer(legacyTransfer.id, '配送员')
    const historicalLot = await prisma.inventoryLot.findFirstOrThrow({
      where: { materialId: historicalRaw.id, sourceType: 'LEGACY_INVENTORY' }, include: { balances: true },
    })
    close(Number(historicalLot.balances.find((item) => item.locationId === location.id)?.stockQty), 2, '历史批次配送后原库位余额')
    close(Number(historicalLot.balances.find((item) => item.locationId === productionLocation.id)?.stockQty), 2, '历史批次配送后目标库位余额')
    await reverseManagedFlowTransfer(legacyTransfer.id, { reason: '验证历史批次配送回滚' }, '配送员')
    const returnedHistoricalLot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: historicalLot.id }, include: { balances: true } })
    close(Number(returnedHistoricalLot.balances.find((item) => item.locationId === location.id)?.stockQty), 4, '历史批次配送冲销后完整回库')

    await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, { materialId: raw.id, stockQty: 4, valuationQty: 4, costAmount: 36, type: 'OPENING', refType: 'VERIFY', refId: 'legacy', note: '历史未追踪库存', locationId: location.id })
    })
    const legacyOrder = await prisma.productionOrder.create({ data: { orderNo: `WO-LEGACY-${suffix}`, productId: product.id, materialId: finished.id, planQty: 2, status: 'RELEASED' } })
    const legacyActual = await prisma.productionOrderActual.create({
      data: {
        actualNo: `PA-LEGACY-${suffix}`, orderId: legacyOrder.id, actualDate: new Date('2026-08-13T04:00:00.000Z'), workers: '生产员',
        equipmentExceptionReason: '历史批次验证未配置实际设备', workInstructionExceptionReason: '历史批次验证未配置作业文件',
        inputs: { create: { materialId: raw.id, locationId: location.id, materialCode: raw.code, materialName: raw.name, quantityPerBatch: 1, plannedQty: 2, actualQty: 2, unit: 'kg' } },
        outputs: { create: { materialId: finished.id, locationId: location.id, materialCode: finished.code, materialName: finished.name, quantityPerBatch: 1, plannedQty: 2, actualQty: 2, unit: '件', isPrimary: true } },
      }, include: { inputs: true },
    })
    await confirmProductionOrderActual(legacyOrder.id, legacyActual.id, '生产确认员')
    const legacyLot = await prisma.inventoryLot.findFirst({ where: { materialId: raw.id, sourceType: 'LEGACY_INVENTORY' } })
    assert.ok(legacyLot, '历史未追踪可用库存必须显式形成兼容批次')
    assert.equal(legacyLot.supplierLotNo, null, '历史兼容批次不能伪造供应商批号')

    console.log('批次谱系验证通过：来料内部批次、FIFO 投入分配、父子谱系、来源红冲保护、生产冲销恢复、历史兼容和批次配送回滚均符合预期。')
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
