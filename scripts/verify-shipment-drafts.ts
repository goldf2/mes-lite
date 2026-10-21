import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verificationRoot = mkdtempSync(join(tmpdir(), 'mes-shipment-drafts-'))
process.env.DATABASE_URL = `file:${join(verificationRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], { env: { ...process.env, RUST_LOG: 'info' }, stdio: 'pipe' })

async function main() {
  const [{ prisma }, inventory, creation, lifecycle, { updateShipmentDraft }, { updateShipmentPrices }, { getShipmentDetail }, { createWarehousePackage }, legacy, { updateShipmentDraftSchema }, { unrestrictedDataScope }] = await Promise.all([
    import('../lib/prisma'), import('../modules/inventory'), import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'), import('../modules/sales/server/shipment-draft-service'),
    import('../modules/sales/server/shipment-pricing-service'), import('../modules/sales/server/fulfillment-query-service'),
    import('../modules/inventory/server/warehouse-package-command-service'), import('../modules/sales/server/shipment-package-command-service'),
    import('../modules/sales/contracts/fulfillment-schema'), import('../modules/identity-access'),
  ])
  const audit = { operatorName: '草稿回归操作员' }
  const { listShipmentPackages } = await import('../modules/sales/server/shipment-package-query-service')
  try {
    const customer = await prisma.customer.create({ data: { code: 'DRAFT-CUSTOMER', name: '草稿客户甲' } })
    const otherCustomer = await prisma.customer.create({ data: { code: 'DRAFT-OTHER', name: '草稿客户乙' } })
    const locationA = await prisma.inventoryLocation.create({ data: { code: 'DRAFT-A', name: '草稿 A 库位', isDefault: true } })
    const locationB = await prisma.inventoryLocation.create({ data: { code: 'DRAFT-B', name: '草稿 B 库位' } })
    const fixture = async (code: string, locationId: string, qty: number, unitPrice: number) => {
      const material = await prisma.material.create({ data: { code, name: code, customerId: customer.id, category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO', defaultSalePrice: unitPrice } })
      const lot = await prisma.$transaction(async (tx) => {
        const receipt = await inventory.postInventoryReceipt(tx, { materialId: material.id, locationId, stockQty: qty, valuationQty: qty, costAmount: qty * unitPrice, type: 'VERIFY_IN', refType: 'VERIFY_DRAFT', refId: code, note: '草稿期初', idempotencyKey: `${code}:IN` })
        const result = await inventory.createInventoryLotReceipt(tx, { lotNo: `${code}:LOT`, materialId: material.id, sourceType: 'VERIFY_DRAFT', sourceId: code, locationId, inventoryStatus: 'AVAILABLE', stockQty: qty, valuationQty: qty, costAmount: qty * unitPrice, stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: `${code}:LOT` })
        await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: result.id, inventoryStatus: 'AVAILABLE' } })
        if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: result.id, inventoryStatus: 'AVAILABLE' } })
        return result
      })
      return { material, lot }
    }
    const a = await fixture('DRAFT-PRODUCT-A', locationA.id, 40, 10)
    const b = await fixture('DRAFT-PRODUCT-B', locationB.id, 20, 20)
    const box = (lotId: string, locationId: string, quantity: number, key: string) => createWarehousePackage({ inventoryLotId: lotId, locationId, quantity, packagingType: 'CARTON', packedBy: '包装员', packedAt: '2026-10-21T01:00:00.000Z', clientRequestId: key }, '仓库员')
    const boxOne = await box(a.lot.id, locationA.id, 4, 'DRAFT-BOX-ONE')
    const boxTwo = await box(a.lot.id, locationA.id, 2, 'DRAFT-BOX-TWO')
    const boxB = await box(b.lot.id, locationB.id, 3, 'DRAFT-BOX-B')
    const stockSnapshot = async () => ({
      stocks: await prisma.stock.findMany({ orderBy: { materialId: 'asc' } }),
      balances: await prisma.inventoryLotBalance.findMany({ orderBy: { id: 'asc' } }),
      costs: await prisma.inventoryCostLayer.findMany({ orderBy: { id: 'asc' } }),
      logs: await prisma.stockLog.count(),
    })
    const initialStock = await stockSnapshot()
    const created = await creation.createManagedShipment({ customerId: customer.id, packageIds: [boxOne.id], items: [{ materialId: a.material.id, locationId: locationA.id, qty: 3, unitPrice: 11 }] })
    await updateShipmentPrices(created.id, { updatedAt: created.updatedAt.toISOString(), reason: '已补填价格', items: [{ id: created.items[0].id, unitPrice: 13 }] }, unrestrictedDataScope, audit)
    let detail = await getShipmentDetail(created.id)
    const originalAllocation = await prisma.shipmentPackageAllocation.findUniqueOrThrow({ where: { shipmentId_packageDocumentId: { shipmentId: created.id, packageDocumentId: boxOne.id } } })
    assert.equal(detail.draft?.items[0].qty, 3, '草稿散货不能把箱内数量重复带入')
    assert.equal(detail.draft?.warehousePackages[0].id, boxOne.id, '自身已占用箱必须仍可编辑')
    const edit = async (changes: Record<string, unknown> = {}) => {
      const input = updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: detail.updatedAt.toISOString(), customerId: customer.id, items: detail.draft!.items, packageIds: detail.draft!.warehousePackages.map((item) => item.id), ...changes })
      const result = await updateShipmentDraft(created.id, input, unrestrictedDataScope, audit, '草稿编辑员')
      detail = await getShipmentDetail(created.id)
      return result
    }
    await edit({ note: '只改备注应保留商品价格', items: detail.draft!.items.map(({ unitPrice: _price, ...item }) => item) })
    assert.equal(detail.items[0].unitPrice, 13, '散货未显式传价也应保留已补价格')
    assert.deepEqual(await prisma.shipmentPackageAllocation.findUniqueOrThrow({ where: { id: originalAllocation.id } }), originalAllocation, '原箱占用身份与时间不得因编辑刷新')
    const stale = detail.updatedAt.toISOString()
    await edit({ items: [{ materialId: a.material.id, locationId: locationA.id, qty: 5 }, { materialId: b.material.id, locationId: locationB.id, qty: 2 }], packageIds: [boxTwo.id, boxB.id], voucherNo: 'EDITED-VOUCHER', trackingNo: 'EDITED-TRACKING' })
    assert.deepEqual(detail.items.map((item) => [item.materialId, item.qty, item.looseQty, item.boxQty, item.unitPrice]), [[a.material.id, 7, 5, 2, 13], [b.material.id, 5, 2, 3, 20]])
    assert.equal(detail.qty, 12)
    assert.equal(detail.totalAmount, 191)
    assert.equal(detail.packages.some((item) => item.id === boxOne.id), false, '已移除货箱不能残留单据展示或打印内容')
    assert.equal((await listShipmentPackages(created.id)).some((item) => item.id === boxOne.id), false, '公共货箱列表应与详情一致排除编辑移除的箱')
    assert.equal((await prisma.shipmentPackageAllocation.findUniqueOrThrow({ where: { id: originalAllocation.id } })).status, 'RELEASED')
    const persisted = async () => ({ shipment: await prisma.shipment.findUniqueOrThrow({ where: { id: created.id }, include: { items: { orderBy: { id: 'asc' } }, packageAllocations: { orderBy: { id: 'asc' } } } }), auditCount: await prisma.auditLog.count() })
    const beforeFailed = await persisted()
    await assert.rejects(() => updateShipmentDraft(created.id, updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: stale, customerId: customer.id, items: [], packageIds: [boxOne.id] }), unrestrictedDataScope, audit, '旧页面'), /变化/)
    await assert.rejects(() => edit({ customerId: otherCustomer.id, packageIds: [boxOne.id] }), /不属于/)
    await assert.rejects(() => updateShipmentDraft(created.id, updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: detail.updatedAt.toISOString(), customerId: customer.id, items: [{ materialId: a.material.id, locationId: locationA.id, qty: 1 }] }), { ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [locationA.id] }, audit, '越权编辑'), /范围|无权/)
    assert.deepEqual(await persisted(), beforeFailed, '过期、客户不匹配与越权编辑必须整体回滚，包括审计与时间戳')
    const otherDraft = await creation.createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] })
    await assert.rejects(() => edit({ packageIds: [boxOne.id] }), /占用/)
    await lifecycle.cancelManagedShipment(otherDraft.id, '回归操作员', '释放竞争占用')
    await edit({ packageIds: [boxOne.id, boxTwo.id, boxB.id] })
    const readded = await prisma.shipmentPackageAllocation.findUniqueOrThrow({ where: { id: originalAllocation.id } })
    assert.equal(readded.status, 'RESERVED', '移除后应可在同一单据重新添加原箱')
    assert.equal(readded.releasedAt, null)
    await edit({ items: [], packageIds: [boxOne.id] })
    assert.equal(detail.items[0].unitPrice, 13, '转为纯箱也不能丢失已补价格')
    assert.equal(detail.items[0].qty, 4)
    assert.equal(detail.draft!.items.length, 0)
    assert.deepEqual(await stockSnapshot(), initialStock, '任何草稿增删改和失败操作均不得变动库存、批次、成本或流水')

    await edit({ items: [{ materialId: a.material.id, locationId: locationA.id, qty: 5 }], packageIds: [boxOne.id] })
    const legacyBox = await legacy.createShipmentPackage(created.id, { shipmentItemId: detail.items[0].id, quantity: 2, weightUnit: 'kg' }, '旧装箱员')
    await assert.rejects(() => edit({ items: [], packageIds: [boxOne.id] }), /先移除/)
    const legacyItemId = detail.items[0].id
    await edit({ note: '保留旧货箱引用' })
    assert.equal(detail.items[0].id, legacyItemId)
    await legacy.archiveShipmentPackage(created.id, legacyBox.id, '旧装箱员')
    await edit({ items: [{ materialId: b.material.id, locationId: locationB.id, qty: 1 }], packageIds: [boxB.id] })
    assert.equal((await prisma.packageDocumentItem.findFirstOrThrow({ where: { packageDocumentId: legacyBox.id } })).shipmentItemId, null)
    assert.equal(detail.items.length, 1)
    assert.equal(detail.items[0].qty, 4)
    assert.equal(detail.items[0].materialId, b.material.id)
    await lifecycle.shipManagedShipment(created.id, '真实确认人')
    const frozen = await getShipmentDetail(created.id)
    assert.equal(frozen.draft, undefined)
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: b.material.id } })).qty, 16, '确认后应按编辑后的商品和箱数扣减')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: a.material.id } })).qty, 40, '已移除商品不得扣库')
    await assert.rejects(() => updateShipmentDraft(created.id, updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: frozen.updatedAt.toISOString(), customerId: customer.id, items: [], packageIds: [boxOne.id] }), unrestrictedDataScope, audit, '冻结后尝试'), /冻结/)
    await updateShipmentPrices(created.id, { updatedAt: frozen.updatedAt.toISOString(), reason: '确认后补价', items: [{ id: frozen.items[0].id, unitPrice: 21 }] }, unrestrictedDataScope, audit)
    assert.equal((await getShipmentDetail(created.id)).totalAmount, 84, '发货后仍保留原价格补填能力')
    await lifecycle.reverseManagedShipment(created.id, '回归主管', '验证完成恢复库存')
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: b.material.id } })).qty, 20)
    assert.equal((await inventory.resolveWarehousePackage(boxB.packageNo, true)).id, boxB.id)

    const raceDraft = await creation.createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] })
    const raceInput = updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: raceDraft.updatedAt.toISOString(), customerId: customer.id, items: [{ materialId: a.material.id, locationId: locationA.id, qty: 1 }], packageIds: [boxOne.id] })
    const race = await Promise.allSettled([updateShipmentDraft(raceDraft.id, raceInput, unrestrictedDataScope, audit, '编辑竞争甲'), updateShipmentDraft(raceDraft.id, raceInput, unrestrictedDataScope, audit, '编辑竞争乙')])
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1, '同一旧版本并发编辑必须只有一方成功')
    assert.equal(await prisma.shipmentPackageAllocation.count({ where: { shipmentId: raceDraft.id, status: 'RESERVED' } }), 1)
    await lifecycle.cancelManagedShipment(raceDraft.id, '回归主管', '并发验证后释放')
    const confirmRaceDraft = await creation.createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] })
    const confirmRaceInput = updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: confirmRaceDraft.updatedAt.toISOString(), customerId: customer.id, items: [{ materialId: a.material.id, locationId: locationA.id, qty: 1 }], packageIds: [boxOne.id] })
    await assert.rejects(() => updateShipmentDraft(confirmRaceDraft.id, updateShipmentDraftSchema.parse({ ...confirmRaceInput, items: [{ materialId: b.material.id, locationId: locationB.id, qty: 1 }] }), { ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [locationA.id] }, audit, '不能新增越权库位'), /范围|无权/)
    const confirmRace = await Promise.allSettled([updateShipmentDraft(confirmRaceDraft.id, confirmRaceInput, unrestrictedDataScope, audit, '编辑与确认竞争'), lifecycle.shipManagedShipment(confirmRaceDraft.id, '并发确认员')])
    assert.ok(confirmRace.some((result) => result.status === 'fulfilled'), '编辑与确认竞争至少一方应能完成')
    let confirmRaceResult = await getShipmentDetail(confirmRaceDraft.id)
    if (confirmRaceResult.status === 'PENDING') {
      await lifecycle.shipManagedShipment(confirmRaceDraft.id, '编辑后重试确认')
      confirmRaceResult = await getShipmentDetail(confirmRaceDraft.id)
    }
    assert.equal(confirmRaceResult.status, 'SHIPPED')
    assert.ok([4, 5].includes(confirmRaceResult.qty))
    assert.equal((await prisma.stock.findUniqueOrThrow({ where: { materialId: a.material.id } })).qty, 40 - confirmRaceResult.qty, '并发确认只能按最终完整版本扣一次库存')
    assert.equal(await prisma.stockLog.count({ where: { refType: 'SHIPMENT', refId: confirmRaceDraft.id } }), 1)
    await lifecycle.reverseManagedShipment(confirmRaceDraft.id, '回归主管', '并发编辑确认验证后恢复')
    const cancelledHistory = await creation.createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id, boxTwo.id] })
    await updateShipmentDraft(cancelledHistory.id, updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: cancelledHistory.updatedAt.toISOString(), customerId: customer.id, items: [], packageIds: [boxTwo.id] }), unrestrictedDataScope, audit, '先删一箱再取消')
    await lifecycle.cancelManagedShipment(cancelledHistory.id, '回归主管', '保留取消前实际构成')
    assert.deepEqual((await getShipmentDetail(cancelledHistory.id)).packages.map((item) => item.id), [boxTwo.id], '取消单据应保留取消时货箱构成，但不恢复此前编辑移除的箱')
    assert.deepEqual((await listShipmentPackages(cancelledHistory.id)).map((item) => item.id), [boxTwo.id], '公共货箱列表应保留取消时历史构成')
    assert.equal((await inventory.resolveWarehousePackage(boxTwo.packageNo, true)).id, boxTwo.id, '保留取消构成不得继续占用原箱')
    const emptyLegacyDraft = await prisma.shipment.create({ data: { shipmentNo: 'SH-LEGACY-EMPTY', customer: customer.name, customerId: customer.id, qty: 0, status: 'PENDING' } })
    await assert.rejects(() => updateShipmentDraft(emptyLegacyDraft.id, updateShipmentDraftSchema.parse({ mode: 'draft', updatedAt: emptyLegacyDraft.updatedAt.toISOString(), customerId: customer.id, items: [{ materialId: a.material.id, locationId: locationA.id, qty: 1 }] }), { ...unrestrictedDataScope, inventoryMode: 'LOCATIONS', locationIds: [locationA.id] }, audit, '受限账号不可收编无行旧单'), /无权/)
    assert.equal(updateShipmentDraftSchema.safeParse({ ...raceInput, packageIds: [boxOne.id, boxOne.id] }).success, false)
    console.log('发货草稿回归通过：追加/删除商品与货箱、来源不重计、原价保留、占用差集及重加、旧箱兼容、权限/版本回滚、确认冻结、实际库存/批次与冲销恢复。')
  } finally {
    await prisma.$disconnect()
    rmSync(verificationRoot, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
