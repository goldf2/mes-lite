import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-quality-standards-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

const actor = {
  operatorName: '质量工程师',
  auditContext: { operatorId: 'quality-engineer', operatorName: '质量工程师', ipAddress: undefined, userAgent: undefined },
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createInventoryLotReceipt },
    quality,
    standards,
    trends,
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/quality/server/quality-inspection-service'),
    import('../modules/quality/server/quality-inspection-standard-service'),
    import('../modules/quality/server/quality-trend-query-service'),
  ])

  try {
    assert.equal(standards.calculateSuggestedSampleQty(10, { mode: 'FULL', value: 0, min: null, max: null }), 10)
    assert.equal(standards.calculateSuggestedSampleQty(10, { mode: 'FIXED', value: 3, min: null, max: null }), 3)
    assert.equal(standards.calculateSuggestedSampleQty(10, { mode: 'PERCENTAGE', value: 10, min: 2, max: 5 }), 2)
    assert.equal(standards.calculateSuggestedSampleQty(100, { mode: 'PERCENTAGE', value: 20, min: 2, max: 5 }), 5)
    assert.equal(standards.calculateSuggestedSampleQty(1, { mode: 'FIXED', value: 3, min: null, max: null }), 1)

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [location, material] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `QS-LOC-${suffix}`, name: '检验标准验证库位' } }),
      prisma.material.create({ data: {
        code: `QS-MAT-${suffix}`, name: '检验标准验证成品', category: 'FINISHED',
        unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO',
      } }),
    ])
    const inputV1 = {
      code: `QS-${suffix}`, name: '出厂尺寸检验', materialId: material.id,
      sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT' as const,
      samplingMode: 'PERCENTAGE' as const, sampleValue: 20, minSampleQty: 2, maxSampleQty: 5,
      changeReason: '首次建立检验标准',
      items: [
        { name: '外径', method: '千分尺测量', acceptanceCriteria: '10.00 ± 0.02 mm' },
        { name: '表面', method: '目视检查', acceptanceCriteria: '无裂纹和连续磕伤' },
      ],
    }
    const draftV1 = await standards.createQualityInspectionStandard(inputV1, actor)
    assert.equal(draftV1.status, 'DRAFT')
    assert.equal(draftV1.version, 1)
    const releasedV1 = await standards.releaseQualityInspectionStandard(draftV1.id, actor)
    assert.equal(releasedV1.status, 'RELEASED')
    await assert.rejects(
      () => prisma.qualityInspectionStandard.update({ where: { id: releasedV1.id }, data: { name: '违规覆盖' } }),
    )

    const createPendingLot = async (name: string, qty: number) => {
      const posted = await prisma.$transaction((tx) => postInventoryReceipt(tx, {
        materialId: material.id, stockQty: qty, valuationQty: qty, costAmount: qty * 10,
        type: 'VERIFY_QUALITY_STANDARD_IN', refType: 'VERIFY_QUALITY_STANDARD', refId: name,
        note: '检验标准验证入库', locationId: location.id, inventoryStatus: 'QUARANTINE',
      }))
      return prisma.$transaction(async (tx) => {
        const lot = await createInventoryLotReceipt(tx, {
          lotNo: `LOT-${name}-${suffix}`, materialId: material.id, sourceType: 'VERIFY_QUALITY_STANDARD', sourceId: name,
          locationId: location.id, inventoryStatus: 'QUARANTINE', stockQty: qty, valuationQty: qty,
          costAmount: qty * 10, stockLogId: posted.movement!.id,
          idempotencyKey: `VERIFY_QUALITY_STANDARD:${name}:LOT`, createdBy: '验证员',
        })
        await tx.stockLog.update({ where: { id: posted.movement!.id }, data: {
          lotId: lot.id, inventoryStatus: 'QUARANTINE', toInventoryStatus: 'QUARANTINE',
        } })
        if (posted.costLayer) await tx.inventoryCostLayer.update({ where: { id: posted.costLayer.id }, data: { lotId: lot.id } })
        const inspection = await quality.createProductionQualityInspection(tx, {
          inspectionNo: `QI-${name}-${suffix}`, lotId: lot.id, sourceId: name, inspectedQty: qty,
        })
        return { lot, inspection }
      })
    }

    const first = await createPendingLot('V1', 10)
    const firstTask = await prisma.qualityInspection.findUniqueOrThrow({
      where: { id: first.inspection.id }, include: { checkItems: { orderBy: { sortOrder: 'asc' } } },
    })
    assert.equal(firstTask.standardId, releasedV1.id)
    assert.equal(firstTask.standardCodeSnapshot, inputV1.code.toUpperCase())
    assert.equal(firstTask.standardVersionSnapshot, 1)
    assert.equal(firstTask.suggestedSampleQty, 2)
    assert.deepEqual(firstTask.checkItems.map((item) => item.name), ['外径', '表面'])

    await assert.rejects(() => quality.decideQualityInspection(firstTask.id, {
      decision: 'PASS', sampleQty: 1, goodQty: 1, badQty: 0, note: '低于标准抽样数',
      itemResults: firstTask.checkItems.map((item) => ({ itemId: item.id, result: 'PASS' as const, measuredValue: '合格', note: null })),
    }, '质检员'), /不能低于检验标准建议数量/)
    await assert.rejects(() => quality.decideQualityInspection(firstTask.id, {
      decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: '项目存在不合格却尝试整批放行',
      itemResults: firstTask.checkItems.map((item, index) => ({ itemId: item.id, result: index ? 'PASS' as const : 'FAIL' as const, measuredValue: index ? '合格' : '10.05 mm', note: null })),
    }, '质检员'), /整批合格时所有检验项目必须合格/)
    await quality.decideQualityInspection(firstTask.id, {
      decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: '全部项目符合标准',
      itemResults: firstTask.checkItems.map((item) => ({ itemId: item.id, result: 'PASS' as const, measuredValue: '合格', note: null })),
    }, '质检员')
    await assert.rejects(
      () => prisma.qualityInspectionCheckItem.update({ where: { id: firstTask.checkItems[0].id }, data: { measuredValue: '违规覆盖' } }),
    )

    const copied = await standards.copyQualityInspectionStandard(releasedV1.id, { changeReason: '提高关键尺寸抽样数' }, actor)
    assert.equal(copied.version, 2)
    const updatedV2 = await standards.updateQualityInspectionStandard(copied.id, {
      ...inputV1, samplingMode: 'FIXED', sampleValue: 3, minSampleQty: null, maxSampleQty: null,
      changeReason: '提高关键尺寸抽样数',
    }, actor)
    assert.equal(updatedV2.samplingMode, 'FIXED')
    const releasedV2 = await standards.releaseQualityInspectionStandard(updatedV2.id, actor)
    assert.equal(releasedV2.status, 'RELEASED')
    assert.equal((await prisma.qualityInspectionStandard.findUniqueOrThrow({ where: { id: releasedV1.id } })).status, 'OBSOLETE')

    const second = await createPendingLot('V2', 10)
    const secondTask = await prisma.qualityInspection.findUniqueOrThrow({
      where: { id: second.inspection.id }, include: { checkItems: { orderBy: { sortOrder: 'asc' } } },
    })
    assert.equal(secondTask.standardId, releasedV2.id)
    assert.equal(secondTask.standardVersionSnapshot, 2)
    assert.equal(secondTask.suggestedSampleQty, 3)
    await quality.decideQualityInspection(secondTask.id, {
      decision: 'FAIL', sampleQty: 3, goodQty: 2, badQty: 1, note: '外径超上限，整批冻结',
      itemResults: secondTask.checkItems.map((item, index) => ({ itemId: item.id, result: index ? 'PASS' as const : 'FAIL' as const, measuredValue: index ? '合格' : '10.05 mm', note: index ? null : '超上限' })),
    }, '质检员')
    const reinspection = await quality.disposeQualityInspection(secondTask.id, {
      operationId: crypto.randomUUID(), action: 'REINSPECT', stockQty: 1, reason: '复核超差样本',
    }, '质量工程师')
    const followUp = await prisma.qualityInspection.findUniqueOrThrow({
      where: { id: reinspection.followUpInspection!.id }, include: { checkItems: true },
    })
    assert.equal(followUp.standardId, secondTask.standardId, '复检必须沿用原任务标准快照')
    assert.equal(followUp.standardVersionSnapshot, secondTask.standardVersionSnapshot)
    assert.equal(followUp.checkItems.length, secondTask.checkItems.length)

    const trend = await trends.getQualityTrendWorkspace({
      startDate: new Date(Date.now() - 86_400_000).toISOString(), endDate: new Date(Date.now() + 86_400_000).toISOString(),
    })
    assert.equal(trend.summary.completedInspections, 2)
    assert.equal(trend.summary.passedInspections, 1)
    assert.equal(trend.summary.failedInspections, 1)
    assert.equal(trend.summary.sampleQty, 5)
    assert.equal(trend.summary.goodQty, 4)
    assert.equal(trend.summary.samplePassRate, 80)
    assert.equal(trend.failedItems[0]?.name, '外径')
    assert.equal(trend.failedItems[0]?.count, 1)
    assert.ok(await prisma.auditLog.count({ where: { entityType: 'QUALITY_INSPECTION_STANDARD' } }) >= 5)
    console.log('质量检验标准验证通过：版本生命周期、任务快照、自动抽样、逐项结果、复检继承与趋势统计均符合预期。')
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
