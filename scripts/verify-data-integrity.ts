import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  applyDataIntegrityAction,
  getDataIntegrityReport,
} from '../lib/data-integrity'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-integrity-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const rollbackMarker = new Error('VERIFY_DATA_INTEGRITY_ROLLBACK')

async function main() {
  const suffix = Date.now().toString()

  try {
    await prisma.$transaction(async (tx) => {
      const output = await tx.material.create({
        data: {
          code: `VERIFY-DATA-FIN-${suffix}`,
          name: '数据检查验证成品',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
        },
      })
      const raw = await tx.material.create({
        data: {
          code: `VERIFY-DATA-RAW-${suffix}`,
          name: '数据检查验证原料',
          category: 'RAW',
          unit: 'm',
          stockUnit: 'm',
          valuationUnit: 'kg',
        },
      })
      const product = await tx.product.create({
        data: {
          sku: `MAT-${output.code}`,
          name: output.name,
          category: output.category,
          unit: '个',
        },
      })
      const bom = await tx.bOM.create({
        data: {
          productId: product.id,
          outputQuantity: 1,
          outputUnit: '个',
        },
      })
      const mismatched = await tx.bOMItem.create({
        data: {
          bomId: bom.id,
          itemType: 'MATERIAL',
          materialId: raw.id,
          quantity: 0.35,
          unit: 'kg',
        },
      })
      const duplicate = await tx.bOMItem.create({
        data: {
          bomId: bom.id,
          itemType: 'MATERIAL',
          materialId: raw.id,
          quantity: 0.35,
          unit: 'm',
        },
      })
      const selfReference = await tx.bOMItem.create({
        data: {
          bomId: bom.id,
          itemType: 'MATERIAL',
          materialId: output.id,
          quantity: 1,
          unit: '件',
        },
      })
      const report = await tx.dailyProductionReport.create({
        data: {
          reportNo: `VERIFY-DATA-${suffix}`,
          reportDate: new Date(),
          finishedMaterialId: output.id,
          workers: '验证',
          bomId: bom.id,
          bomName: bom.name,
          bomVersion: bom.version,
          bomType: bom.bomType,
          bomOutputQuantity: bom.outputQuantity,
          bomOutputUnit: bom.outputUnit,
        },
      })
      const consumption = await tx.dailyProductionConsumption.create({
        data: {
          reportId: report.id,
          materialId: raw.id,
          locationId: 'default-location',
          bomItemId: `missing-${suffix}`,
          materialCode: raw.code,
          materialName: raw.name,
          quantityPerUnit: 0.35,
          plannedQty: 0.35,
          actualQty: 0.35,
          unit: 'm',
        },
      })
      const linkedConsumption = await tx.dailyProductionConsumption.create({
        data: {
          reportId: report.id,
          materialId: raw.id,
          locationId: 'default-location',
          bomItemId: duplicate.id,
          materialCode: raw.code,
          materialName: raw.name,
          quantityPerUnit: 0.35,
          plannedQty: 0.35,
          actualQty: 0.35,
          unit: 'm',
        },
      })
      const layer = await tx.inventoryCostLayer.create({
        data: {
          materialId: raw.id,
          stockQty: 10,
          remainingStockQty: 10,
          valuationQty: 10,
          remainingValuationQty: 10,
          stockUnit: 'kg',
          valuationUnit: 'kg',
          valuationUnitCost: 1,
          stockUnitCost: 1,
          totalAmount: 10,
          remainingAmount: 10,
        },
      })

      let reportData = await getDataIntegrityReport(tx)
      const issueTypesByEntity = new Set(reportData.issues.map((issue) => `${issue.type}:${issue.entityId}`))
      assert.ok(issueTypesByEntity.has(`BOM_UNIT_MISMATCH:${mismatched.id}`), '应发现 BOM 原料单位不一致')
      assert.ok(issueTypesByEntity.has(`BOM_DUPLICATE_MATERIAL:${duplicate.id}`), '应发现 BOM 重复原料')
      assert.ok(issueTypesByEntity.has(`BOM_SELF_REFERENCE:${selfReference.id}`), '应发现 BOM 自引用')
      assert.ok(issueTypesByEntity.has(`BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`), '应发现 BOM 产出单位不一致')
      assert.ok(issueTypesByEntity.has(`PRODUCT_UNIT_MISMATCH:${product.id}`), '应发现兼容产品单位不一致')
      assert.ok(issueTypesByEntity.has(`DAILY_BOM_ITEM_REFERENCE_STALE:${consumption.id}`), '应发现日报失效指针')
      assert.ok(issueTypesByEntity.has(`OPEN_COST_LAYER_UNIT_MISMATCH:${layer.id}`), '应发现有效成本层单位不一致')

      await applyDataIntegrityAction(
        tx,
        `BOM_UNIT_MISMATCH:${mismatched.id}`,
        'SYNC_BOM_ITEM_UNIT',
      )
      await applyDataIntegrityAction(
        tx,
        `BOM_DUPLICATE_MATERIAL:${duplicate.id}`,
        'DELETE_BOM_ITEM',
      )
      await applyDataIntegrityAction(
        tx,
        `BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`,
        'SYNC_BOM_OUTPUT_UNIT',
      )
      await applyDataIntegrityAction(
        tx,
        `PRODUCT_UNIT_MISMATCH:${product.id}`,
        'SYNC_PRODUCT_UNIT',
      )
      await applyDataIntegrityAction(
        tx,
        `DAILY_BOM_ITEM_REFERENCE_STALE:${consumption.id}`,
        'CLEAR_STALE_BOM_ITEM_REF',
      )

      reportData = await getDataIntegrityReport(tx)
      const remainingIds = new Set(reportData.issues.map((issue) => issue.id))
      assert.equal(remainingIds.has(`BOM_UNIT_MISMATCH:${mismatched.id}`), false, '单位修复后问题应消失')
      assert.equal(remainingIds.has(`BOM_DUPLICATE_MATERIAL:${duplicate.id}`), false, '删除后重复问题应消失')
      assert.equal(remainingIds.has(`BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`), false, '产出单位修复后问题应消失')
      assert.equal(remainingIds.has(`PRODUCT_UNIT_MISMATCH:${product.id}`), false, '兼容产品单位修复后问题应消失')
      assert.equal(remainingIds.has(`DAILY_BOM_ITEM_REFERENCE_STALE:${consumption.id}`), false, '清理后失效指针问题应消失')
      assert.ok(remainingIds.has(`OPEN_COST_LAYER_UNIT_MISMATCH:${layer.id}`), '有效成本层风险必须保留为人工处理')
      const detachedConsumption = await tx.dailyProductionConsumption.findUniqueOrThrow({
        where: { id: linkedConsumption.id },
      })
      assert.equal(detachedConsumption.bomItemId, null, '删除 BOM 明细时应保留日报快照并清空失效指针')

      throw rollbackMarker
    }, { timeout: 20000 })
  } catch (error) {
    if (error !== rollbackMarker) throw error
  }

  console.log('数据关系扫描、安全修复、受控删除与事务回滚验证通过')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  })
