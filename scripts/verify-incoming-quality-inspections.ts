import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-incoming-quality-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

const actor = {
  operatorName: '质量工程师',
  auditContext: { operatorId: 'incoming-quality-engineer', operatorName: '质量工程师', ipAddress: undefined, userAgent: undefined },
}

async function main() {
  const [
    { prisma },
    { createMaterialInSchema },
    { createMaterialIns },
    { getMaterialInDetail },
    { receiveManagedMaterialIn, reverseManagedMaterialIn },
    standards,
    quality,
    trends,
    { postInventoryIssue },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/receiving/contracts/material-in-schema'),
    import('../modules/receiving/server/material-in-service'),
    import('../modules/receiving/server/material-in-detail-service'),
    import('../modules/receiving/server/material-in-status-service'),
    import('../modules/quality/server/quality-inspection-standard-service'),
    import('../modules/quality/server/quality-inspection-service'),
    import('../modules/quality/server/quality-trend-query-service'),
    import('../lib/inventory'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [supplier, location, controlled, direct] = await Promise.all([
      prisma.supplier.create({ data: { code: `IQ-SUP-${suffix}`, name: '来料质检验证供应商' } }),
      prisma.inventoryLocation.create({ data: { code: `IQ-LOC-${suffix}`, name: '来料质检验证库位', isDefault: true } }),
      prisma.material.create({ data: { code: `IQ-RAW-${suffix}`, name: '启用来料检验的原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', costingMethod: 'FIFO' } }),
      prisma.material.create({ data: { code: `IQ-DIRECT-${suffix}`, name: '直接入库辅料', category: 'AUXILIARY', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg', costingMethod: 'FIFO' } }),
    ])
    const standard = await standards.createQualityInspectionStandard({
      code: `IQS-${suffix}`, name: '原料炉批入厂检验', materialId: controlled.id,
      sourceType: 'MATERIAL_IN', samplingMode: 'FIXED', sampleValue: 2,
      minSampleQty: null, maxSampleQty: null, changeReason: '验证已发布标准显式启用来料自动检验',
      items: [
        { name: '材质证明', method: '核对质保书', acceptanceCriteria: '炉批和化学成分与采购要求一致' },
        { name: '外观', method: '目视检查', acceptanceCriteria: '无严重锈蚀、混料和压伤' },
      ],
    }, actor)
    const released = await standards.releaseQualityInspectionStandard(standard.id, actor)
    assert.equal(released.sourceType, 'MATERIAL_IN')

    const receipt = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id, stagingLocationId: location.id, receivedBy: '仓管员',
      items: [
        { materialId: controlled.id, qty: 10, valuationQty: 10, unitPrice: 8, priceUnit: 'kg', priceBasis: 'STOCK', batchNo: 'HEAT-IQ-001' },
        { materialId: direct.id, qty: 5, valuationQty: 5, unitPrice: 3, priceUnit: 'kg', priceBasis: 'STOCK', batchNo: 'AUX-IQ-001' },
      ],
    }))
    const receiveResult = await receiveManagedMaterialIn(receipt.first.id, '仓管员')
    assert.equal(receiveResult.qualityInspectionsCreated, 1, '一张多物料来料单只为启用标准的行生成质量任务')

    const controlledLine = await prisma.materialIn.findUniqueOrThrow({
      where: { id: receipt.items[0].id },
      include: { inventoryLot: { include: { balances: true, inspections: { include: { checkItems: { orderBy: { sortOrder: 'asc' } } } } } } },
    })
    const directLine = await prisma.materialIn.findUniqueOrThrow({
      where: { id: receipt.items[1].id }, include: { inventoryLot: { include: { balances: true, inspections: true } } },
    })
    const controlledInspection = controlledLine.inventoryLot?.inspections[0]
    assert.ok(controlledInspection, '启用来料标准的行必须生成质量任务')
    assert.equal(controlledInspection.sourceType, 'MATERIAL_IN')
    assert.equal(controlledInspection.sourceId, controlledLine.id)
    assert.equal(controlledInspection.standardId, released.id)
    assert.equal(controlledInspection.suggestedSampleQty, 2)
    assert.equal(controlledInspection.checkItems.length, 2)
    assert.deepEqual(controlledLine.inventoryLot?.balances.map((item) => [item.inventoryStatus, item.stockQty]), [['QUARANTINE', 10]])
    assert.deepEqual(directLine.inventoryLot?.balances.map((item) => [item.inventoryStatus, item.stockQty]), [['AVAILABLE', 5]])
    assert.equal(directLine.inventoryLot?.inspections.length, 0, '没有已发布来料标准的行必须保持直接入库')

    const [controlledStock, directStock, controlledLayer, receiptView] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: controlled.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: direct.id } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: controlledLine.id } }),
      getMaterialInDetail(receipt.first.id),
    ])
    assert.deepEqual([controlledStock.qty, controlledStock.availableQty, controlledStock.quarantineQty], [10, 0, 10])
    assert.deepEqual([directStock.qty, directStock.availableQty, directStock.quarantineQty], [5, 5, 0])
    assert.equal(controlledLayer.inventoryStatus, 'QUARANTINE')
    assert.equal(receiptView.items[0].inventoryLot?.inspections?.[0]?.inspectionNo, controlledInspection.inspectionNo, '来料详情必须呈现质量交接结果')
    await assert.rejects(() => prisma.$transaction((tx) => postInventoryIssue(tx, {
      materialId: controlled.id, stockQty: 1, type: 'VERIFY_ISSUE', refType: 'VERIFY', refId: 'blocked', note: '待检库存不得领用', locationId: location.id,
    })), /库存不足/, '来料待检库存不得参与领料')

    await quality.decideQualityInspection(controlledInspection.id, {
      decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: '质保书和外观符合要求',
      itemResults: controlledInspection.checkItems.map((item) => ({ itemId: item.id, result: 'PASS' as const, measuredValue: '符合', note: null })),
    }, '质检员')
    const releasedStock = await prisma.stock.findUniqueOrThrow({ where: { materialId: controlled.id } })
    assert.deepEqual([releasedStock.qty, releasedStock.availableQty, releasedStock.quarantineQty], [10, 10, 0])

    await reverseManagedMaterialIn(receipt.first.id, { reason: '合格但尚未使用，整单退回供应商' }, '仓管主管')
    const [reversedControlled, reversedDirect, reversedLots] = await Promise.all([
      prisma.stock.findUniqueOrThrow({ where: { materialId: controlled.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: direct.id } }),
      prisma.inventoryLot.findMany({ where: { materialInId: { in: receipt.items.map((item) => item.id) } } }),
    ])
    assert.deepEqual([reversedControlled.qty, reversedControlled.availableQty, reversedControlled.quarantineQty], [0, 0, 0])
    assert.deepEqual([reversedDirect.qty, reversedDirect.availableQty], [0, 0])
    assert.equal(reversedLots.every((lot) => lot.status === 'REVERSED'), true)

    const pendingReceipt = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id, stagingLocationId: location.id, receivedBy: '仓管员',
      materialId: controlled.id, qty: 4, valuationQty: 4, unitPrice: 8, priceUnit: 'kg', priceBasis: 'STOCK', batchNo: 'HEAT-IQ-002',
    }))
    await receiveManagedMaterialIn(pendingReceipt.first.id, '仓管员')
    const pendingInspection = await prisma.qualityInspection.findFirstOrThrow({ where: { sourceType: 'MATERIAL_IN', sourceId: pendingReceipt.items[0].id } })
    await reverseManagedMaterialIn(pendingReceipt.first.id, { reason: '待检阶段发现供应商送错料' }, '仓管主管')
    const cancelledInspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: pendingInspection.id } })
    assert.deepEqual([cancelledInspection.status, cancelledInspection.result], ['CANCELLED', 'CANCELLED'], '待检来料红冲必须取消未执行的质量任务')
    await assert.rejects(
      () => prisma.qualityInspection.update({ where: { id: pendingInspection.id }, data: { note: '尝试覆盖已取消任务' } }),
      '数据库必须阻断已取消来料检验任务被直接覆盖',
    )

    const failedReceipt = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id, stagingLocationId: location.id, receivedBy: '仓管员',
      materialId: controlled.id, qty: 6, valuationQty: 6, unitPrice: 8, priceUnit: 'kg', priceBasis: 'STOCK', batchNo: 'HEAT-IQ-003',
    }))
    await receiveManagedMaterialIn(failedReceipt.first.id, '仓管员')
    const failedInspection = await prisma.qualityInspection.findFirstOrThrow({
      where: { sourceType: 'MATERIAL_IN', sourceId: failedReceipt.items[0].id }, include: { checkItems: true },
    })
    await quality.decideQualityInspection(failedInspection.id, {
      decision: 'FAIL', sampleQty: 2, goodQty: 1, badQty: 1, note: '炉批证明不一致，整批冻结',
      itemResults: failedInspection.checkItems.map((item, index) => ({ itemId: item.id, result: index === 0 ? 'FAIL' as const : 'PASS' as const, measuredValue: index === 0 ? '炉批不符' : '符合', note: null })),
    }, '质检员')
    await assert.rejects(
      () => reverseManagedMaterialIn(failedReceipt.first.id, { reason: '尝试绕过不合格处置红冲' }, '仓管主管'),
      /已完成不合格判定|冻结|质量处置/,
      '不合格来料必须先按质量处置流程处理，不能直接红冲',
    )

    const trend = await trends.getQualityTrendWorkspace({
      startDate: new Date(Date.now() - 86_400_000).toISOString(), endDate: new Date(Date.now() + 86_400_000).toISOString(),
      materialId: controlled.id, sourceType: 'MATERIAL_IN',
    })
    assert.deepEqual([trend.summary.completedInspections, trend.summary.passedInspections, trend.summary.failedInspections], [2, 1, 1])
    console.log('来料自动检验验证通过：标准显式启用、多物料分流、待检隔离、质量交接、合格放行、待检红冲取消、不合格红冲阻断与趋势均符合预期。')
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
