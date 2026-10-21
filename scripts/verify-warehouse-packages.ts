import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EffectiveDataScope } from '../modules/identity-access'

const verificationRoot = mkdtempSync(join(tmpdir(), 'mes-warehouse-packages-'))
process.env.DATABASE_URL = `file:${join(verificationRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, RUST_LOG: 'info' }, stdio: 'pipe',
})

const close = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(Number(actual) - expected) <= 0.000001, `${label}: expected ${expected}, got ${actual}`)
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt, postInventoryIssue, postInventoryLocationTransfer, createInventoryLotReceipt, transitionInventoryLotStatus },
    { createWarehousePackage, voidWarehousePackage, getOrCreateWarehousePackageLabel },
    { getWarehousePackage, resolveWarehousePackage, listWarehousePackages, listWarehousePackingOptions },
    { createManagedShipment, archiveManagedShipment },
    { shipManagedShipment, cancelManagedShipment, reverseManagedShipment },
    { createLabelPrintJob },
    { createLabelPrintJobSchema },
    { createWarehousePackageSchema },
    { purgeArchivedRecord, ArchivedRecordPurgeError },
    { resolveScannableDocument },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/inventory'),
    import('../modules/inventory/server/warehouse-package-command-service'),
    import('../modules/inventory/server/warehouse-package-query-service'),
    import('../modules/sales/server/fulfillment-command-service'),
    import('../modules/sales/server/fulfillment-status-service'),
    import('../modules/operations-tools/server/label-print-command-service'),
    import('../modules/operations-tools/contracts/scan-print'),
    import('../modules/inventory/contracts/warehouse-package-schema'),
    import('../modules/operations-tools/server/archived-record-purge-service'),
    import('../modules/business-documents/server/scannable-document-query-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const [location, otherLocation, customer, material] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `WP-LOC-${suffix}`, name: '装箱主库位', isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `WP-X-${suffix}`, name: '隔离目标库位' } }),
      prisma.customer.create({ data: { code: `WP-CUS-${suffix}`, name: '货箱混合发货客户' } }),
      prisma.material.create({ data: {
        code: `WP-MAT-${suffix}`, name: '有真实批次与成本的装箱成品', spec: '规格A',
        category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO', defaultSalePrice: 50,
      } }),
    ])
    const restrictedScope: EffectiveDataScope = {
      operatorId: 'warehouse-restricted', employeeId: null, employeeCode: null,
      productionMode: 'ALL', inventoryMode: 'LOCATIONS', workCenterIds: [],
      locationIds: [otherLocation.id], inheritedLegacyDefault: false,
    }
    const receiptLot = async (name: string, cost: number, date: string) => prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id, stockQty: 10, valuationQty: 10, costAmount: cost,
        locationId: location.id, type: 'VERIFY_IN', refType: 'VERIFY_WAREHOUSE', refId: `${suffix}:${name}`,
        note: `仓库装箱回归 ${name}`, idempotencyKey: `WP:${suffix}:${name}:IN`,
      })
      const lot = await createInventoryLotReceipt(tx, {
        lotNo: `WP-${name}-${suffix}`, materialId: material.id, sourceType: 'VERIFY_WAREHOUSE', sourceId: `${suffix}:${name}`,
        locationId: location.id, inventoryStatus: 'AVAILABLE', receivedAt: new Date(date),
        stockQty: 10, valuationQty: 10, costAmount: cost,
        stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: `WP:${suffix}:${name}:LOT`,
      })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({
        where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE', createdAt: new Date(date) },
      })
      return lot
    })
    const oldLot = await receiptLot('OLDER', 100, '2026-10-19T01:00:00.000Z')
    const boxLot = await receiptLot('NEWER', 300, '2026-10-20T01:00:00.000Z')
    const inventorySnapshot = async () => ({
      stock: await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      balances: await prisma.inventoryLotBalance.findMany({ where: { lot: { materialId: material.id } }, orderBy: [{ lotId: 'asc' }, { locationId: 'asc' }, { inventoryStatus: 'asc' }] }),
      layers: await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } }),
      logs: await prisma.stockLog.count({ where: { stock: { materialId: material.id } } }),
    })
    const initial = await inventorySnapshot()
    const input = (quantity: number, request: string) => ({
      inventoryLotId: boxLot.id, locationId: location.id, quantity,
      packagingType: 'METAL_CAGE' as const, packedBy: '包装员甲', packedAt: '2026-10-21T01:00:00.000Z',
      lengthMm: 600, widthMm: 400, heightMm: 300,
      productionPersonnel: ['生产员甲', '生产员乙'], qualityPersonnel: ['质检员甲'], clientRequestId: `WP:${suffix}:${request}`,
    })
    assert.equal(createWarehousePackageSchema.safeParse(input(0.0000001, 'TINY')).success, false, '低于库存精度的数量应在HTTP入参校验拒绝')
    assert.equal(createWarehousePackageSchema.safeParse(input(1.0000001, 'PRECISION')).success, false, '超过六位小数不能打印与库存不同的数量')
    const boxOne = await createWarehousePackage(input(4, 'ONE'), '仓库员')
    const boxTwo = await createWarehousePackage(input(2, 'TWO'), '仓库员')
    assert.match(boxOne.packageNo, /^BX-\d{8}-\d{3}$/)
    assert.equal(boxOne.shipmentId, null, '仓库装箱不应要求已有发货单')
    assert.equal(boxOne.placement?.locationId, location.id)
    assert.equal(boxOne.placement?.xMm, null, '未测量坐标不应虚构为零')
    assert.equal(boxOne.items[0]?.inventoryLotId, boxLot.id)
    assert.deepEqual(await inventorySnapshot(), initial, '装箱不能更改库存、成本层、批次数量或流水')
    const repeated = await createWarehousePackage(input(4, 'ONE'), '仓库员')
    assert.equal(repeated.id, boxOne.id, '同一请求重试不能产生新箱')
    await assert.rejects(() => createWarehousePackage(input(5, 'EXCESS'), '仓库员'), /不足|装箱|可用/)
    assert.equal(await prisma.packageDocument.count({ where: { sourceType: 'WAREHOUSE' } }), 2)
    assert.deepEqual(await inventorySnapshot(), initial, '超装失败应整笔回滚')

    await assert.rejects(() => getWarehousePackage(boxOne.id, restrictedScope), /无权|不存在/)
    await assert.rejects(() => createWarehousePackage(input(1, 'FORBIDDEN'), '越权员', restrictedScope), /无权|范围/)
    const scopedList = await listWarehousePackages(new URLSearchParams(), restrictedScope)
    assert.equal(scopedList.total, 0, '不可从查询泄露无权库位货箱')
    await getOrCreateWarehousePackageLabel(boxOne.id, '包装员')
    await getOrCreateWarehousePackageLabel(boxOne.id, '包装员')
    const revisions = await prisma.packageLabelRevision.findMany({ where: { packageDocumentId: boxOne.id } })
    assert.equal(revisions.length, 1, '补打应复用同内容版本快照')
    assert.match(revisions[0].payloadJson, new RegExp(material.code))
    assert.match(revisions[0].payloadJson, /生产员甲/)
    assert.match(revisions[0].payloadJson, /质检员甲/)
    assert.equal(JSON.parse(revisions[0].payloadJson).source.personnelSource, 'MANUAL', '标签来源必须明确人工人员补录，不把姓名当作系统质量事实')
    const printInput = createLabelPrintJobSchema.parse({
      clientRequestId: `WP:${suffix}:PRINT`, templateType: 'DOCUMENT_QR', referenceType: 'PACKAGE_DOCUMENT',
      referenceId: boxOne.id, copies: 2, labelWidthMm: 100, labelHeightMm: 150,
      payload: { code: 'FORGED-CODE', fields: [{ label: '数量', value: '9999 件' }] },
    })
    const printJob = await createLabelPrintJob(printInput, '标签操作员')
    assert.equal(printJob.labelRevisionId, revisions[0].id, '打印任务必须关联服务端本箱内容快照')
    assert.equal(printJob.payloadJson, revisions[0].payloadJson, '不能接受客户端伪造的产品或数量')
    assert.equal(printJob.labelWidthMm, 100)
    assert.equal(printJob.labelHeightMm, 150)
    assert.equal(printJob.copies, 2)
    assert.equal(printJob.status, 'REQUESTED', '浏览器请求不应冒称设备已出纸')
    assert.equal((await createLabelPrintJob(printInput, '标签操作员')).id, printJob.id)
    await assert.rejects(() => createLabelPrintJob({ ...printInput, clientRequestId: `WP:${suffix}:PRINT-FORBIDDEN` }, '越权打印', restrictedScope), /无权|不存在|范围/)
    assert.equal((await resolveWarehousePackage(`${boxOne.packageNo}#v1`, true)).id, boxOne.id)
    await assert.rejects(() => resolveWarehousePackage(`${boxOne.packageNo}#v99`, true), /失效|版本/)
    const documentScan = await resolveScannableDocument(`${boxOne.packageNo}#v1`)
    assert.equal(documentScan?.referenceId, boxOne.id)
    assert.match(documentScan?.href || '', /page=warehousePackages/, '通用扫码也应导航到仓库独立箱，而非要求已有发货单')
    assert.equal(await resolveScannableDocument(`${boxOne.packageNo}#v99`), null)
    assert.equal(await resolveScannableDocument(`${boxOne.packageNo}#v1`, restrictedScope), null)

    await assert.rejects(() => prisma.$transaction((tx) => postInventoryIssue(tx, {
      materialId: material.id, locationId: location.id, stockQty: 15, type: 'PRODUCTION_OUT',
      refType: 'VERIFY', refId: suffix, note: '不得领用已装箱库存',
    })), /装箱|货箱|不足|可用/)
    await assert.rejects(() => prisma.$transaction((tx) => postInventoryLocationTransfer(tx, {
      materialId: material.id, stockQty: 15, sourceLocationId: location.id, targetLocationId: otherLocation.id,
      refId: suffix, note: '不得移走已装箱库存',
    })), /装箱|货箱|不足|可用/)
    assert.deepEqual(await inventorySnapshot(), initial, '领用/移库被阻断时不能留下库存与成本变化')

    const reserved = await createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id, boxTwo.id] })
    close(reserved.qty, 6, '纯选箱发货总数量')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: boxOne.id } })).status, 'PACKED', '待发占用不应改变货物生命周期')
    assert.equal(await prisma.shipmentPackageAllocation.count({ where: { shipmentId: reserved.id, status: 'RESERVED' } }), 2)
    const shipmentCount = await prisma.shipment.count()
    await assert.rejects(() => createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] }), /占用|使用|选|装箱|可发/)
    assert.equal(await prisma.shipment.count(), shipmentCount, '重复选箱失败不能残留发货单')
    await assert.rejects(() => resolveWarehousePackage(boxOne.packageNo, true), /占用|不能/)
    await assert.rejects(() => voidWarehousePackage(boxOne.id, '已选箱不得作废', '仓库员'), /占用|发货/)
    await cancelManagedShipment(reserved.id, '仓库主管', '客户暂缓发货')
    assert.equal(await prisma.shipmentPackageAllocation.count({ where: { shipmentId: reserved.id, status: 'RESERVED' } }), 0)
    assert.equal((await resolveWarehousePackage(boxOne.packageNo, true)).id, boxOne.id)
    assert.deepEqual(await inventorySnapshot(), initial, '取消待发货单只释放占用，不改变库存')

    const archiveCandidate = await createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] })
    const archived = await archiveManagedShipment(archiveCandidate.id, undefined, '归档验证员')
    assert.equal(archived.updated.status, 'CANCELLED', '归档待发箱单必须同时取消，防止恢复后按散货误发')
    assert.ok(archived.updated.deletedAt)
    assert.equal(archived.updated.cancelledBy, '归档验证员')
    await assert.rejects(() => purgeArchivedRecord('shipment', archiveCandidate.id), (error: unknown) => error instanceof ArchivedRecordPurgeError && error.status === 409, '货箱分配历史不能永久删除')
    assert.equal(await prisma.shipmentPackageAllocation.count({ where: { shipmentId: archiveCandidate.id, status: 'RESERVED' } }), 0)
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: boxOne.id } })).status, 'PACKED')
    await prisma.shipment.update({ where: { id: archiveCandidate.id }, data: { deletedAt: null } })
    await assert.rejects(() => shipManagedShipment(archiveCandidate.id, '发货员'), /待发货/, '通用恢复只恢复历史单据，不能重新确认已释放货箱的单据')
    assert.equal((await resolveWarehousePackage(boxOne.packageNo, true)).id, boxOne.id, '原箱应仍可重新建立发货单')
    assert.deepEqual(await inventorySnapshot(), initial, '箱单归档及恢复不能改变库存')

    const mixed = await createManagedShipment({
      customerId: customer.id, packageIds: [boxOne.id, boxTwo.id],
      items: [{ materialId: material.id, locationId: location.id, qty: 3 }],
    })
    close(mixed.qty, 9, '箱内6件加散货3件应合计9件')
    close(mixed.items.reduce((sum, item) => sum + item.qty, 0), 9, '客户产品行不能只显示箱号')
    await shipManagedShipment(mixed.id, '发货员')
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: mixed.id } })).shippedBy, '发货员', '确认发货必须把真实责任人保存到单头，不只记录库存流水')
    const afterMixed = await inventorySnapshot()
    close(afterMixed.stock.qty, 11, '混合发货后总库存')
    close(afterMixed.stock.totalCost, 190, '箱按新批成本180+散货旧批成本30，剩余成本190')
    const oldBalance = afterMixed.balances.find((item) => item.lotId === oldLot.id && item.inventoryStatus === 'AVAILABLE')
    const boxBalance = afterMixed.balances.find((item) => item.lotId === boxLot.id && item.inventoryStatus === 'AVAILABLE')
    close(oldBalance?.stockQty ?? -1, 7, '散货只消耗旧批3件')
    close(boxBalance?.stockQty ?? -1, 4, '选箱必须消耗新批6件，不能FIFO误扣旧批')
    const allocations = await prisma.shipmentLotAllocation.findMany({ where: { shipmentId: mixed.id, status: 'ACTIVE' } })
    close(allocations.filter((item) => item.lotId === boxLot.id).reduce((sum, item) => sum + item.stockQty, 0), 6, '选箱批次追溯数量')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: boxOne.id } })).status, 'SHIPPED')
    await assert.rejects(() => shipManagedShipment(mixed.id, '发货员'), /待发货/)
    close((await inventorySnapshot()).stock.qty, 11, '重复确认不得再次扣库存')
    await reverseManagedShipment(mixed.id, '仓库主管', '错发未离库，恢复原箱')
    const afterReverse = await inventorySnapshot()
    close(afterReverse.stock.qty, 20, '冲销后恢复数量')
    close(afterReverse.stock.totalCost, 400, '冲销后恢复不同批次的原始成本')
    close(afterReverse.balances.find((item) => item.lotId === oldLot.id && item.inventoryStatus === 'AVAILABLE')?.stockQty ?? -1, 10, '冲销恢复旧批')
    close(afterReverse.balances.find((item) => item.lotId === boxLot.id && item.inventoryStatus === 'AVAILABLE')?.stockQty ?? -1, 10, '冲销恢复箱内批次')
    assert.equal((await resolveWarehousePackage(boxOne.packageNo, true)).status, 'PACKED', '受控冲销后原箱可重新选择')

    const race = await Promise.allSettled([
      createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] }),
      createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] }),
    ])
    const winners = race.filter((result) => result.status === 'fulfilled')
    assert.equal(winners.length, 1, '并发选同一箱只能有一个成功发货草稿')
    assert.equal(race.filter((result) => result.status === 'rejected').length, 1)
    assert.equal(await prisma.shipmentPackageAllocation.count({ where: { packageDocumentId: boxOne.id, status: 'RESERVED' } }), 1)
    const winner = winners[0]
    assert.equal(winner.status, 'fulfilled')
    if (winner.status === 'fulfilled') await cancelManagedShipment(winner.value.id, '仓库主管', '并发占用验证后释放')

    const loose = await createManagedShipment({ customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 1 }] })
    await shipManagedShipment(loose.id, '发货员')
    const afterLoose = await inventorySnapshot()
    close(afterLoose.stock.qty, 19, '保留原纯散货发货')
    close(afterLoose.stock.totalCost, 390, '纯散货从未装箱旧批FIFO消耗')
    close(afterLoose.balances.find((item) => item.lotId === boxLot.id && item.inventoryStatus === 'AVAILABLE')?.stockQty ?? -1, 10, '纯散货不得误扣已装箱后批')
    await reverseManagedShipment(loose.id, '仓库主管', '纯散货验证后恢复')

    const frozenShipment = await createManagedShipment({ customerId: customer.id, items: [], packageIds: [boxOne.id] })
    await prisma.$transaction((tx) => transitionInventoryLotStatus(tx, {
      lotId: boxLot.id, fromStatus: 'AVAILABLE', toStatus: 'HOLD', type: 'QUALITY_HOLD',
      refType: 'VERIFY', refId: `${suffix}:HOLD`, idempotencyKey: `WP:${suffix}:HOLD`, createdBy: '质检员',
    }))
    await assert.rejects(() => shipManagedShipment(frozenShipment.id, '发货员'), /批次|可用|冻结|不足/)
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: frozenShipment.id } })).status, 'PENDING')
    await cancelManagedShipment(frozenShipment.id, '仓库主管', '质检冻结，取消原发货')
    await assert.rejects(() => resolveWarehousePackage(`${boxOne.packageNo}#v1`, true), /批次|可用|冻结|不足/, '释放占用后，扫码仍必须拦截已冻结的真实批次')
    await assert.rejects(() => createWarehousePackage(input(1, 'HELD'), '仓库员'), /可用|不足|冻结/)

    await voidWarehousePackage(boxTwo.id, '标签损坏，解除装箱重新核实', '仓库员')
    await assert.rejects(() => resolveWarehousePackage(boxTwo.packageNo, true), /作废|失效|不能/)
    assert.equal(await prisma.goodsPlacement.count({ where: { packageDocumentId: boxOne.id } }), 1, '每箱只保留唯一当前位置')
    const purgeLoose = await createManagedShipment({ customerId: customer.id, items: [{ materialId: material.id, locationId: location.id, qty: 1 }] })
    assert.equal(await prisma.shipmentItemSource.count({ where: { shipmentItem: { shipmentId: purgeLoose.id } } }), 1)
    await archiveManagedShipment(purgeLoose.id)
    await purgeArchivedRecord('shipment', purgeLoose.id)
    assert.equal(await prisma.shipment.findUnique({ where: { id: purgeLoose.id } }), null, '无箱且无过账的归档散货草稿仍可永久删除')
    assert.equal(await prisma.shipmentItemSource.count({ where: { shipmentItemId: purgeLoose.items[0].id } }), 0, '仅清除该草稿自身来源，不能被FK阻断')

    const shortageFixture = async (name: string) => {
      const shortageMaterial = await prisma.material.create({ data: {
        code: `WP-SHORT-${name}-${suffix}`, name: `装箱散货欠库${name}`, unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO',
      } })
      const newLot = await prisma.$transaction(async (tx) => {
        const receipt = await postInventoryReceipt(tx, { materialId: shortageMaterial.id, stockQty: 14, valuationQty: 14, costAmount: 140,
          locationId: location.id, type: 'VERIFY_IN', refType: 'VERIFY_WAREHOUSE', refId: `${suffix}:SHORT:${name}`, note: '装箱散货欠库期初', idempotencyKey: `WP:${suffix}:SHORT:${name}:IN` })
        const lot = await createInventoryLotReceipt(tx, { lotNo: `WP-SHORT-LOT-${name}-${suffix}`, materialId: shortageMaterial.id,
          sourceType: 'VERIFY_WAREHOUSE', sourceId: `${suffix}:SHORT:${name}`, locationId: location.id, inventoryStatus: 'AVAILABLE',
          stockQty: 14, valuationQty: 14, costAmount: 140, stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id,
          idempotencyKey: `WP:${suffix}:SHORT:${name}:LOT` })
        await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
        if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
        return lot
      })
      const packed = await createWarehousePackage({ ...input(4, `SHORT:${name}`), inventoryLotId: newLot.id }, '仓库员')
      return { material: shortageMaterial, lot: newLot, packed }
    }
    const crossLocation = await shortageFixture('CROSS')
    const crossShipment = await createManagedShipment({ customerId: customer.id, items: [{ materialId: crossLocation.material.id, locationId: otherLocation.id, qty: 1 }] })
    await shipManagedShipment(crossShipment.id, '散货发货员')
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: crossShipment.id } })).status, 'SHIPPED')
    const crossShortage = await prisma.shipmentStockShortage.findFirstOrThrow({ where: { shipmentId: crossShipment.id } })
    close(crossShortage.stockQty, 1, '其他库位有箱不能阻断零库存库位散货欠库')
    assert.equal(crossShortage.locationId, otherLocation.id)
    close((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId: crossLocation.lot.id, locationId: location.id, inventoryStatus: 'AVAILABLE' } })).stockQty, 14, '跨库散货不能消耗A库箱内或批次')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: crossLocation.packed.id } })).status, 'PACKED')

    const mixedShortage = await shortageFixture('MIXED')
    const retainedBox = await createWarehousePackage({ ...input(4, 'SHORT:RETAINED'), inventoryLotId: mixedShortage.lot.id }, '仓库员')
    const shortageShipment = await createManagedShipment({ customerId: customer.id, packageIds: [mixedShortage.packed.id], items: [{ materialId: mixedShortage.material.id, locationId: location.id, qty: 10 }] })
    close(shortageShipment.qty, 14, '混合欠库仍按箱4加散货10汇总')
    await shipManagedShipment(shortageShipment.id, '散货发货员')
    const shortage = await prisma.shipmentStockShortage.findFirstOrThrow({ where: { shipmentId: shortageShipment.id } })
    close(shortage.stockQty, 4, '箱4+散货10只能消费真实箱4和未装散货6，其余散货欠4')
    close(shortage.settledStockQty, 0, '后补前欠库未结清')
    close((await prisma.stock.findUniqueOrThrow({ where: { materialId: mixedShortage.material.id } })).qty, 0, '发货14后净库存账为0')
    close((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId: mixedShortage.lot.id, locationId: location.id, inventoryStatus: 'AVAILABLE' } })).stockQty, 4, '未选箱4件的实物批次必须完整保留')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: retainedBox.id } })).status, 'PACKED')
    const boxSource = await prisma.shipmentItemSource.findFirstOrThrow({ where: { shipmentItem: { shipmentId: shortageShipment.id }, sourceType: 'BOX' } })
    close(boxSource.quantity, 4, '原选箱来源只计一次4件')
    const refillLot = await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, { materialId: mixedShortage.material.id, stockQty: 4, valuationQty: 4, costAmount: 80,
        locationId: location.id, type: 'VERIFY_IN', refType: 'VERIFY_WAREHOUSE', refId: `${suffix}:REFILL`, note: '混合发货欠库后补', idempotencyKey: `WP:${suffix}:REFILL:IN` })
      const lot = await createInventoryLotReceipt(tx, { lotNo: `WP-REFILL-${suffix}`, materialId: mixedShortage.material.id, sourceType: 'VERIFY_WAREHOUSE', sourceId: `${suffix}:REFILL`,
        locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 4, valuationQty: 4, costAmount: 80,
        stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: `WP:${suffix}:REFILL:LOT` })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      return lot
    })
    const settled = await prisma.shipmentStockShortage.findUniqueOrThrow({ where: { id: shortage.id } })
    assert.equal(settled.status, 'SETTLED')
    close(settled.settledStockQty, 4, '后补入库4精确结清散货欠库')
    close((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId: refillLot.id, locationId: location.id, inventoryStatus: 'AVAILABLE' } })).stockQty, 0, '后补批次4全分配到欠库')
    close((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId: mixedShortage.lot.id, locationId: location.id, inventoryStatus: 'AVAILABLE' } })).stockQty, 4, '后补不能重复扣旧批或未选箱')
    const stockAfterRefill = await prisma.stock.findUniqueOrThrow({ where: { materialId: mixedShortage.material.id } })
    close(stockAfterRefill.qty, 4, '补欠后净账回到仍在库的未选箱4件')
    close(stockAfterRefill.totalCost, 40, '补欠后只保留未选箱原始成本40')
    close((await prisma.shipment.findUniqueOrThrow({ where: { id: shortageShipment.id } })).shippedCostAmount, 180, '原实发成本100加后补4件80，不重复计箱')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: mixedShortage.packed.id } })).status, 'SHIPPED')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: retainedBox.id } })).status, 'PACKED')
    close((await prisma.shipmentItemSource.findUniqueOrThrow({ where: { id: boxSource.id } })).quantity, 4, '后补不更改原箱来源数量')

    const averageMaterial = await prisma.material.create({ data: { code: `WP-AVG-${suffix}`, name: 'AVG欠库后选实箱', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'AVG' } })
    const averageLot = await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, { materialId: averageMaterial.id, stockQty: 10, valuationQty: 10, costAmount: 10, locationId: location.id,
        type: 'VERIFY_IN', refType: 'VERIFY_WAREHOUSE', refId: `${suffix}:AVG`, note: 'AVG包装与欠库期初', idempotencyKey: `WP:${suffix}:AVG:IN` })
      const lot = await createInventoryLotReceipt(tx, { lotNo: `WP-AVG-LOT-${suffix}`, materialId: averageMaterial.id, sourceType: 'VERIFY_WAREHOUSE', sourceId: `${suffix}:AVG`, locationId: location.id,
        inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 10, stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: `WP:${suffix}:AVG:LOT` })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      return lot
    })
    const averageBox = await createWarehousePackage({ ...input(6, 'AVG:BOX'), inventoryLotId: averageLot.id }, '仓库员')
    const averageLooseShipment = await createManagedShipment({ customerId: customer.id, items: [{ materialId: averageMaterial.id, locationId: location.id, qty: 8 }] })
    await shipManagedShipment(averageLooseShipment.id, '散货发货员')
    const averageAfterLoose = await prisma.stock.findUniqueOrThrow({ where: { materialId: averageMaterial.id } })
    close(averageAfterLoose.qty, 2, 'AVG散发8后的净数量')
    close(averageAfterLoose.valuationQty, 6, 'AVG只能实际扣4散货，辅助余额6')
    close(averageAfterLoose.totalCost, 6, 'AVG不能按净账2误算箱成本')
    const averageBoxShipment = await createManagedShipment({ customerId: customer.id, items: [], packageIds: [averageBox.id] })
    await shipManagedShipment(averageBoxShipment.id, '箱发货员')
    const averageAfterBox = await prisma.stock.findUniqueOrThrow({ where: { materialId: averageMaterial.id } })
    close(averageAfterBox.qty, -4, 'AVG实箱6出库后仍保留原散货欠4的净账')
    close(averageAfterBox.valuationQty, 0, 'AVG实物辅助总量只能扣6，不能按净账分母算18')
    close(averageAfterBox.totalCost, 0, 'AVG实箱成本6耗尽，不能超结18')
    close((await prisma.shipment.findUniqueOrThrow({ where: { id: averageBoxShipment.id } })).shippedCostAmount, 6, 'AVG箱实际成本')

    const averageVoidMaterial = await prisma.material.create({ data: { code: `WP-AVG-VOID-${suffix}`, name: 'AVG欠库作废最后箱后散发', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'AVG' } })
    const averageVoidLot = await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, { materialId: averageVoidMaterial.id, stockQty: 10, valuationQty: 10, costAmount: 10, locationId: location.id,
        type: 'VERIFY_IN', refType: 'VERIFY_WAREHOUSE', refId: `${suffix}:AVG-VOID`, note: 'AVG欠库与作废期初', idempotencyKey: `WP:${suffix}:AVG-VOID:IN` })
      const lot = await createInventoryLotReceipt(tx, { lotNo: `WP-AVG-VOID-LOT-${suffix}`, materialId: averageVoidMaterial.id, sourceType: 'VERIFY_WAREHOUSE', sourceId: `${suffix}:AVG-VOID`, locationId: location.id,
        inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 10, stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: `WP:${suffix}:AVG-VOID:LOT` })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      return lot
    })
    const averageVoidBox = await createWarehousePackage({ ...input(6, 'AVG-VOID:BOX'), inventoryLotId: averageVoidLot.id }, '仓库员')
    const averageVoidFirst = await createManagedShipment({ customerId: customer.id, items: [{ materialId: averageVoidMaterial.id, locationId: location.id, qty: 8 }] })
    await shipManagedShipment(averageVoidFirst.id, '散货发货员')
    await voidWarehousePackage(averageVoidBox.id, '解包装为散货继续发出', '仓库员')
    assert.equal(await prisma.packageDocument.count({ where: { sourceType: 'WAREHOUSE', status: 'PACKED', items: { some: { materialId: averageVoidMaterial.id } } } }), 0, '该物料已无活动箱，不能再以活动箱存在与否决定欠库成本分母')
    const averageVoidSecond = await createManagedShipment({ customerId: customer.id, items: [{ materialId: averageVoidMaterial.id, locationId: location.id, qty: 2 }] })
    await shipManagedShipment(averageVoidSecond.id, '散货发货员')
    const averageAfterVoid = await prisma.stock.findUniqueOrThrow({ where: { materialId: averageVoidMaterial.id } })
    close(averageAfterVoid.qty, 0, '欠库4仍在，实际散发2后的净账0')
    close(averageAfterVoid.valuationQty, 4, '作废最后箱后，辅助余额应仍为实物4')
    close(averageAfterVoid.totalCost, 4, '作废最后箱后，成本余额应仍为实物4')
    close((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId: averageVoidLot.id, locationId: location.id, inventoryStatus: 'AVAILABLE' } })).stockQty, 4, '作废不改库存，散发只扣实际2件')

    const legacyMaterial = await prisma.material.create({ data: { code: `WP-OPEN-${suffix}`, name: '旧FIFO期初与新真箱共存', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO' } })
    const openingStock = await prisma.stock.create({ data: { materialId: legacyMaterial.id, qty: 5, availableQty: 5, valuationQty: 5, availableValuationQty: 5,
      totalCost: 50, stockUnitCost: 10, valuationUnitCost: 10 } })
    await prisma.stockLocationBalance.create({ data: { stockId: openingStock.id, locationId: location.id, qty: 5, availableQty: 5 } })
    assert.equal(await prisma.inventoryCostLayer.count({ where: { materialId: legacyMaterial.id } }), 0)
    assert.equal(await prisma.inventoryLot.count({ where: { materialId: legacyMaterial.id } }), 0, '保留真实旧版期初无层/批次的兼容输入')
    const legacyNewLot = await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, { materialId: legacyMaterial.id, stockQty: 10, valuationQty: 10, costAmount: 200, locationId: location.id,
        type: 'VERIFY_IN', refType: 'VERIFY_WAREHOUSE', refId: `${suffix}:OPEN`, note: '旧FIFO期初后真实新批', idempotencyKey: `WP:${suffix}:OPEN:IN` })
      const lot = await createInventoryLotReceipt(tx, { lotNo: `WP-OPEN-LOT-${suffix}`, materialId: legacyMaterial.id, sourceType: 'VERIFY_WAREHOUSE', sourceId: `${suffix}:OPEN`, locationId: location.id,
        inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 200, stockLogId: receipt.movement!.id, costLayerId: receipt.costLayer?.id, idempotencyKey: `WP:${suffix}:OPEN:LOT` })
      await tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      if (receipt.costLayer) await tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } })
      return lot
    })
    const legacyNewBox = await createWarehousePackage({ ...input(4, 'OPEN:BOX'), inventoryLotId: legacyNewLot.id }, '仓库员')
    const openingShipment = await createManagedShipment({ customerId: customer.id, items: [{ materialId: legacyMaterial.id, locationId: location.id, qty: 1 }] })
    await shipManagedShipment(openingShipment.id, '散货发货员')
    const afterOpeningShipment = await prisma.stock.findUniqueOrThrow({ where: { materialId: legacyMaterial.id } })
    close(afterOpeningShipment.qty, 14, '新箱共存不阻断旧FIFO期初散货')
    close(afterOpeningShipment.totalCost, 240, '旧FIFO期初只消费1件成本10，不能误扣新批20')
    close((await prisma.inventoryLotBalance.findFirstOrThrow({ where: { lotId: legacyNewLot.id, locationId: location.id, inventoryStatus: 'AVAILABLE' } })).stockQty, 10, '旧散货不能误扣新真批')
    assert.equal((await prisma.packageDocument.findUniqueOrThrow({ where: { id: legacyNewBox.id } })).status, 'PACKED')
    const packingCandidates = await listWarehousePackingOptions(legacyMaterial.code)
    assert.deepEqual(packingCandidates.map((item) => item.inventoryLotId), [legacyNewLot.id], '可装箱候选只提供真实新批，不能把创建会拒绝的LEGACY期初显示为可选箱')

    console.log('仓库装箱业务回归通过：独立装箱与幂等、数量守恒、标签补打/版本、库位范围、领料/移库保护、打印防伪与纸型、纯箱并发占用/取消/归档恢复保护、纯散货兼容、混合发货真实批次成本、冲销恢复、冻结阻断、跨库散货欠库/后补守恒、AVG欠库后实箱/作废最后箱散发成本和旧FIFO期初兼容及归档删除边界。')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => rmSync(verificationRoot, { recursive: true, force: true }))
