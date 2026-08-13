import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EffectiveDataScope } from '../modules/identity-access'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-quality-dispositions-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

const close = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(actual - expected) <= 0.000001, `${label}: expected ${expected}, got ${actual}`)
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createInventoryLotReceipt },
    { createProductionQualityInspection, decideQualityInspection, disposeQualityInspection },
    { selectPrimaryQualityBalance },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/quality/server/quality-inspection-service'),
    import('../modules/quality/domain/quality-balance-selection'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [location, restrictedLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `QD-${suffix}`, name: '质量处置库位' } }),
      prisma.inventoryLocation.create({ data: { code: `QD-X-${suffix}`, name: '无权质量库位' } }),
    ])
    const scoped: EffectiveDataScope = {
      operatorId: 'quality-scope', employeeId: null, employeeCode: null,
      productionMode: 'ALL', inventoryMode: 'LOCATIONS',
      workCenterIds: [], locationIds: [location.id], inheritedLegacyDefault: false,
    }
    const material = await prisma.material.create({
      data: { code: `QD-MAT-${suffix}`, name: '质量处置验证物料', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件', costingMethod: 'FIFO' },
    })

    const createPendingLot = async (name: string, qty: number, amount: number) => {
      const posted = await prisma.$transaction((tx) => postInventoryReceipt(tx, {
        materialId: material.id, stockQty: qty, valuationQty: qty, costAmount: amount,
        type: 'VERIFY_QUALITY_IN', refType: 'VERIFY_QUALITY', refId: name, note: '质量处置验证入库',
        locationId: location.id, inventoryStatus: 'QUARANTINE',
      }))
      return prisma.$transaction(async (tx) => {
        const lot = await createInventoryLotReceipt(tx, {
          lotNo: `LOT-${name}-${suffix}`, materialId: material.id, sourceType: 'VERIFY_QUALITY', sourceId: name,
          locationId: location.id, inventoryStatus: 'QUARANTINE', stockQty: qty, valuationQty: qty, costAmount: amount,
          stockLogId: posted.movement!.id, idempotencyKey: `VERIFY_QUALITY:${name}:LOT`, createdBy: '验证员',
        })
        await tx.stockLog.update({ where: { id: posted.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'QUARANTINE', toInventoryStatus: 'QUARANTINE' } })
        if (posted.costLayer) await tx.inventoryCostLayer.update({ where: { id: posted.costLayer.id }, data: { lotId: lot.id } })
        const inspection = await createProductionQualityInspection(tx, {
          inspectionNo: `QI-${name}-${suffix}`, lotId: lot.id, sourceId: name, inspectedQty: qty,
        })
        return { lot, inspection }
      })
    }

    const partial = await createPendingLot('PARTIAL', 10, 100)
    await prisma.inventoryLotBalance.create({ data: {
      lotId: partial.lot.id, locationId: restrictedLocation.id, inventoryStatus: 'AVAILABLE',
      stockQty: 0, valuationQty: 0, costAmount: 0,
    } })
    await decideQualityInspection(partial.inspection.id, {
      decision: 'PARTIAL', sampleQty: 2, goodQty: 1, badQty: 1,
      releaseQty: 6, holdQty: 4, note: '部分尺寸合格，分批处置',
    }, '质量判定员', scoped)

    let stock = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    close(Number(stock.availableQty), 6, '部分判定后可用量')
    close(Number(stock.holdQty), 4, '部分判定后冻结量')
    close(Number(stock.quarantineQty), 0, '部分判定后待检量')
    const partialDispositions = await prisma.qualityDisposition.findMany({ where: { inspectionId: partial.inspection.id } })
    assert.deepEqual(partialDispositions.map((item) => item.action).sort(), ['DECISION_HOLD', 'DECISION_RELEASE'])

    const reinspection = await disposeQualityInspection(partial.inspection.id, {
      operationId: crypto.randomUUID(), action: 'REINSPECT', stockQty: 2, reason: '冻结件抽取复检',
    }, '质量处置员')
    assert.ok(reinspection.followUpInspection, '复检必须生成新一轮检验任务')
    assert.equal(selectPrimaryQualityBalance([
      { inventoryStatus: 'HOLD', stockQty: 2 },
      { inventoryStatus: 'QUARANTINE', stockQty: 2 },
    ], 'PENDING')?.inventoryStatus, 'QUARANTINE', '复检待检卡必须优先显示待检余额并提供判定入口')
    await decideQualityInspection(reinspection.followUpInspection!.id, {
      decision: 'PASS', sampleQty: 2, goodQty: 2, badQty: 0, note: '复检合格',
    }, '复检员')
    await disposeQualityInspection(partial.inspection.id, {
      operationId: crypto.randomUUID(), action: 'CONCESSION', stockQty: 1, reason: '客户偏差许可编号 DEV-001',
    }, '质量主管')
    stock = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    close(Number(stock.availableQty), 9, '复检和让步后可用量')
    close(Number(stock.holdQty), 1, '复检和让步后剩余冻结量')

    const rework = await createPendingLot('REWORK', 4, 60)
    await decideQualityInspection(rework.inspection.id, {
      decision: 'FAIL', sampleQty: 2, goodQty: 0, badQty: 2, note: '整批尺寸超差',
    }, '质量判定员')
    await disposeQualityInspection(rework.inspection.id, {
      operationId: crypto.randomUUID(), action: 'REWORK_START', stockQty: 4, reason: '返工单 RW-001',
    }, '质量主管')
    stock = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    close(Number(stock.reworkQty), 4, '返工开始后返工量')
    const reworkComplete = await disposeQualityInspection(rework.inspection.id, {
      operationId: crypto.randomUUID(), action: 'REWORK_COMPLETE', stockQty: 4, reason: '返工单 RW-001 完工送检',
    }, '返工确认员')
    assert.ok(reworkComplete.followUpInspection, '返工完成必须生成新一轮检验任务')
    await decideQualityInspection(reworkComplete.followUpInspection!.id, {
      decision: 'FAIL', sampleQty: 2, goodQty: 0, badQty: 2, note: '返工复检仍不合格',
    }, '复检员')
    await disposeQualityInspection(reworkComplete.followUpInspection!.id, {
      operationId: crypto.randomUUID(), action: 'SCRAP', stockQty: 3, reason: '报废审批 SCRAP-001',
    }, '质量主管')
    await disposeQualityInspection(reworkComplete.followUpInspection!.id, {
      operationId: crypto.randomUUID(), action: 'UNFREEZE', stockQty: 1, reason: '纠正冻结原因后授权解冻',
    }, '质量主管')

    stock = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    close(Number(stock.qty), 11, '报废后总库存')
    close(Number(stock.availableQty), 10, '最终可用量')
    close(Number(stock.holdQty), 1, '最终保留冻结量')
    close(Number(stock.reworkQty), 0, '最终返工量')
    close(Number(stock.totalCost), 115, '报废按批次成本减少总成本')
    const integrity = await prisma.$queryRaw<Array<Record<string, string>>>`PRAGMA quick_check`
    assert.equal(Object.values(integrity[0] || {})[0], 'ok')
    assert.equal(await prisma.qualityDisposition.count(), 11, '所有质量判定和处置都必须保留独立记录')
    assert.equal(await prisma.qualityInspection.count(), 4, '初检、复检和返工复检必须保留完整轮次')

    const blocked = await createPendingLot('BLOCKED', 2, 20)
    await prisma.inventoryLotBalance.create({ data: {
      lotId: blocked.lot.id, locationId: restrictedLocation.id, inventoryStatus: 'AVAILABLE',
      stockQty: 1, valuationQty: 1, costAmount: 10,
    } })
    await assert.rejects(() => decideQualityInspection(blocked.inspection.id, {
      decision: 'PASS', sampleQty: 1, goodQty: 1, badQty: 0, note: '跨库位越权验证',
    }, '质量判定员', scoped), /库存数据范围/)
    console.log('质量处置闭环验证通过：处置、成本守恒、零余额历史库位兼容与跨授权库位阻断均符合预期。')
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
