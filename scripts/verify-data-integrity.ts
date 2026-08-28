import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { parseCsv } from '../lib/csv'
import {
  buildDataIntegrityFaultCsv,
  dataIntegrityFaultFilename,
} from '../modules/operations-tools/domain/data-integrity-export'
import {
  applyDataIntegrityAction,
  getDataIntegrityReport,
} from '../modules/operations-tools/server/data-integrity-service'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-integrity-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const rollbackMarker = new Error('VERIFY_DATA_INTEGRITY_ROLLBACK')

function verifyFaultDetailExport() {
  const csv = buildDataIntegrityFaultCsv({
    checkedAt: '2026-08-29T01:02:03.000Z',
    issues: [{
      id: 'BOM_UNIT_MISMATCH:item-1',
      type: 'BOM_UNIT_MISMATCH',
      severity: 'BLOCKING',
      title: 'BOM 原料单位与当前主单位不一致',
      detail: '包含逗号, 引号"与\n换行的完整说明',
      entityType: 'BOMItem',
      entityId: '=FORMULA-RISK',
      entityLabel: 'MAT-001 · 铝型材',
      currentValue: 'm',
      expectedValue: 'kg',
      actions: [{ key: 'SYNC_BOM_ITEM_UNIT', label: '按当前主单位修复' }],
    }],
  })

  assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV 必须包含 UTF-8 BOM，避免 Excel 打开中文乱码')
  const rows = parseCsv(csv.slice(1))
  assert.equal(rows.length, 2, '应输出表头和一条故障明细')
  assert.deepEqual(rows[0], [
    '序号', '检查时间', '严重程度', '故障ID', '故障类型', '问题标题', '对象类型',
    '对象ID', '对象说明', '当前值', '期望值', '可执行操作', '详细说明',
  ])
  assert.equal(rows[1][2], '阻塞')
  assert.equal(rows[1][3], 'BOM_UNIT_MISMATCH:item-1')
  assert.equal(rows[1][4], 'BOM_UNIT_MISMATCH')
  assert.equal(rows[1][7], "'=FORMULA-RISK", '可能触发电子表格公式的文本必须转义')
  assert.equal(rows[1][11], '按当前主单位修复 (SYNC_BOM_ITEM_UNIT)')
  assert.equal(rows[1][12], '包含逗号, 引号"与\n换行的完整说明')
  assert.match(
    dataIntegrityFaultFilename('2026-08-29T01:02:03.000Z'),
    /^MES-lite-数据故障明细-20260829-\d{6}\.csv$/,
  )
}

async function main() {
  verifyFaultDetailExport()
  const suffix = Date.now().toString()

  try {
    await prisma.$transaction(async (tx) => {
      // Current databases reject these rows. Drop the guards only inside this
      // rollback-only fixture to keep coverage for cleaning historical anomalies.
      await tx.$executeRawUnsafe('DROP TRIGGER "Stock_owner_insert_guard"')
      await tx.$executeRawUnsafe('DROP TRIGGER "Stock_owner_update_guard"')
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
      const bomOutputMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-OUTPUT-${suffix}`,
          name: 'BOMOutput 优先产出',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
        },
      })
      const secondaryOutputMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-SECONDARY-${suffix}`,
          name: 'BOMOutput 副产出',
          category: 'FINISHED',
          unit: '套',
          stockUnit: '套',
          valuationUnit: '套',
        },
      })
      const bomLinkedMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-BOM-LINK-${suffix}`,
          name: 'BOM 直接关联产出',
          category: 'FINISHED',
          unit: 'kg',
          stockUnit: 'kg',
          valuationUnit: 'kg',
        },
      })
      const productLinkedMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-PRODUCT-LINK-${suffix}`,
          name: 'Product 直接关联产出',
          category: 'FINISHED',
          unit: 'm',
          stockUnit: 'm',
          valuationUnit: 'm',
        },
      })
      const skuLinkedMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-SKU-LINK-${suffix}`,
          name: 'SKU 兼容产出',
          category: 'FINISHED',
          unit: 'L',
          stockUnit: 'L',
          valuationUnit: 'L',
        },
      })
      const bomProductConflictMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-BOM-PRODUCT-CONFLICT-${suffix}`,
          name: 'BOM 关系下的 Product 冲突产出',
          category: 'FINISHED',
          unit: 'm',
          stockUnit: 'm',
          valuationUnit: 'm',
        },
      })
      const bomSkuConflictMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-BOM-SKU-CONFLICT-${suffix}`,
          name: 'BOM 关系下的 SKU 冲突产出',
          category: 'FINISHED',
          unit: 'L',
          stockUnit: 'L',
          valuationUnit: 'L',
        },
      })
      const productSkuConflictMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-PRODUCT-SKU-CONFLICT-${suffix}`,
          name: 'Product 关系下的 SKU 冲突产出',
          category: 'FINISHED',
          unit: '卷',
          stockUnit: '卷',
          valuationUnit: '卷',
        },
      })
      const precedenceProduct = await tx.product.create({
        data: {
          sku: `MAT-${skuLinkedMaterial.code}`,
          materialId: productLinkedMaterial.id,
          name: '产出解析优先级验证',
          category: 'FINISHED',
          unit: bomOutputMaterial.stockUnit,
        },
      })
      const precedenceBom = await tx.bOM.create({
        data: {
          productId: precedenceProduct.id,
          materialId: bomLinkedMaterial.id,
          outputQuantity: 1,
          outputUnit: bomOutputMaterial.stockUnit,
          outputs: {
            create: [
              { materialId: bomOutputMaterial.id, quantity: 1, unit: '件', isPrimary: true },
              { materialId: secondaryOutputMaterial.id, quantity: 1, unit: '套', isPrimary: false },
            ],
          },
        },
      })
      const bomLinkedProduct = await tx.product.create({
        data: {
          sku: `MAT-${bomSkuConflictMaterial.code}`,
          materialId: bomProductConflictMaterial.id,
          name: 'BOM 直接关系验证',
          category: 'FINISHED',
          unit: bomLinkedMaterial.stockUnit,
        },
      })
      const bomLinkedBom = await tx.bOM.create({
        data: {
          productId: bomLinkedProduct.id,
          materialId: bomLinkedMaterial.id,
          outputQuantity: 1,
          outputUnit: bomLinkedMaterial.stockUnit,
        },
      })
      const productOnlyMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-PRODUCT-ONLY-${suffix}`,
          name: '仅 Product 直接关联产出',
          category: 'FINISHED',
          unit: '箱',
          stockUnit: '箱',
          valuationUnit: '箱',
        },
      })
      const productLinkedProduct = await tx.product.create({
        data: {
          sku: `MAT-${productSkuConflictMaterial.code}`,
          materialId: productOnlyMaterial.id,
          name: 'Product 直接关系验证',
          category: 'FINISHED',
          unit: productOnlyMaterial.stockUnit,
        },
      })
      const productLinkedBom = await tx.bOM.create({
        data: {
          productId: productLinkedProduct.id,
          outputQuantity: 1,
          outputUnit: productOnlyMaterial.stockUnit,
        },
      })
      const legacyMaterial = await tx.material.create({
        data: {
          code: `VERIFY-DATA-LEGACY-${suffix}`.toUpperCase(),
          name: '旧 SKU 大小写兼容产出',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
        },
      })
      const legacyProduct = await tx.product.create({
        data: {
          sku: `mat-${legacyMaterial.code.toLowerCase()}`,
          name: legacyMaterial.name,
          category: 'FINISHED',
          unit: legacyMaterial.stockUnit,
        },
      })
      const legacyBom = await tx.bOM.create({
        data: {
          productId: legacyProduct.id,
          outputQuantity: 1,
          outputUnit: legacyMaterial.stockUnit,
        },
      })
      const ambiguousProduct = await tx.product.create({
        data: {
          sku: `MAT-${legacyMaterial.code}-AMBIGUOUS`,
          name: '多产出无主标记验证',
          category: 'FINISHED',
          unit: '件',
        },
      })
      const ambiguousBom = await tx.bOM.create({
        data: {
          productId: ambiguousProduct.id,
          outputQuantity: 1,
          outputUnit: '件',
          outputs: {
            create: [
              { materialId: bomOutputMaterial.id, quantity: 1, unit: '件' },
              { materialId: secondaryOutputMaterial.id, quantity: 1, unit: '套' },
            ],
          },
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
          bomType: 'PRODUCTION',
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
      const safeOrphanStock = await tx.stock.create({ data: {} })
      const riskyOrphanStock = await tx.stock.create({
        data: {
          qty: 2,
          quarantineQty: 2,
          valuationQty: 2,
          quarantineValuationQty: 2,
          totalCost: 20,
          quarantineCost: 20,
        },
      })
      const dualOwnerStock = await tx.stock.create({
        data: { materialId: output.id, productId: product.id },
      })

      let reportData = await getDataIntegrityReport(tx)
      const issueTypesByEntity = new Set(reportData.issues.map((issue) => `${issue.type}:${issue.entityId}`))
      assert.ok(issueTypesByEntity.has(`BOM_UNIT_MISMATCH:${mismatched.id}`), '应发现 BOM 原料单位不一致')
      assert.equal(
        reportData.issues.find((issue) => issue.id === `BOM_UNIT_MISMATCH:${mismatched.id}`)?.severity,
        'BLOCKING',
        '草稿 BOM 单位漂移必须阻塞发布',
      )
      assert.equal(
        reportData.issues.find((issue) => issue.id === `BOM_UNIT_MISMATCH:${mismatched.id}`)?.actions[0]?.key,
        'SYNC_BOM_ITEM_UNIT',
        '草稿 BOM 单位漂移应保留受控修复动作',
      )
      for (const resolvedBom of [precedenceBom, bomLinkedBom, productLinkedBom, legacyBom]) {
        assert.equal(
          reportData.issues.some((issue) => issue.id === `BOM_OUTPUT_MATERIAL_UNRESOLVED:${resolvedBom.id}`),
          false,
          '直接关系或唯一旧 SKU 命中时不得报告产出物料未解析',
        )
        assert.equal(
          reportData.issues.some((issue) => issue.id === `BOM_OUTPUT_UNIT_MISMATCH:${resolvedBom.id}`),
          false,
          '产出单位检查必须使用最高优先级解析出的物料',
        )
      }
      assert.ok(
        issueTypesByEntity.has(`BOM_OUTPUT_MATERIAL_UNRESOLVED:${ambiguousBom.id}`),
        '多个 BOMOutput 且无唯一主产出时不得用低优先级关系覆盖',
      )
      assert.ok(issueTypesByEntity.has(`BOM_DUPLICATE_MATERIAL:${duplicate.id}`), '应发现 BOM 重复原料')
      assert.ok(issueTypesByEntity.has(`BOM_SELF_REFERENCE:${selfReference.id}`), '应发现 BOM 自引用')
      assert.ok(issueTypesByEntity.has(`BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`), '应发现 BOM 产出单位不一致')
      assert.ok(issueTypesByEntity.has(`PRODUCT_UNIT_MISMATCH:${product.id}`), '应发现兼容产品单位不一致')
      assert.ok(issueTypesByEntity.has(`DAILY_BOM_ITEM_REFERENCE_STALE:${consumption.id}`), '应发现日报失效指针')
      assert.ok(issueTypesByEntity.has(`OPEN_COST_LAYER_UNIT_MISMATCH:${layer.id}`), '应发现有效成本层单位不一致')
      assert.ok(issueTypesByEntity.has(`STOCK_OWNER_INVALID:${safeOrphanStock.id}`), '应发现可安全清理的孤立空库存')
      assert.ok(issueTypesByEntity.has(`STOCK_OWNER_INVALID:${riskyOrphanStock.id}`), '应发现包含余额的孤立库存风险')
      assert.ok(issueTypesByEntity.has(`STOCK_OWNER_INVALID:${dualOwnerStock.id}`), '应发现同时关联 Material 和 Product 的双归属库存')
      assert.equal(
        reportData.issues.find((issue) => issue.id === `STOCK_OWNER_INVALID:${safeOrphanStock.id}`)?.actions[0]?.key,
        'DELETE_ORPHAN_STOCK',
        '零余额且无引用的孤立库存应提供安全清理操作',
      )
      assert.equal(
        reportData.issues.find((issue) => issue.id === `STOCK_OWNER_INVALID:${riskyOrphanStock.id}`)?.actions.length,
        0,
        '仍有余额的孤立库存不得自动删除',
      )
      assert.equal(
        reportData.issues.find((issue) => issue.id === `STOCK_OWNER_INVALID:${dualOwnerStock.id}`)?.actions.length,
        0,
        '双归属库存不得自动删除',
      )

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
      await applyDataIntegrityAction(
        tx,
        `STOCK_OWNER_INVALID:${safeOrphanStock.id}`,
        'DELETE_ORPHAN_STOCK',
      )

      reportData = await getDataIntegrityReport(tx)
      const remainingIds = new Set(reportData.issues.map((issue) => issue.id))
      assert.equal(remainingIds.has(`BOM_UNIT_MISMATCH:${mismatched.id}`), false, '单位修复后问题应消失')
      assert.equal(remainingIds.has(`BOM_DUPLICATE_MATERIAL:${duplicate.id}`), false, '删除后重复问题应消失')
      assert.equal(remainingIds.has(`BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`), false, '产出单位修复后问题应消失')
      assert.equal(remainingIds.has(`PRODUCT_UNIT_MISMATCH:${product.id}`), false, '兼容产品单位修复后问题应消失')
      assert.equal(remainingIds.has(`DAILY_BOM_ITEM_REFERENCE_STALE:${consumption.id}`), false, '清理后失效指针问题应消失')
      assert.ok(remainingIds.has(`OPEN_COST_LAYER_UNIT_MISMATCH:${layer.id}`), '有效成本层风险必须保留为人工处理')
      assert.equal(remainingIds.has(`STOCK_OWNER_INVALID:${safeOrphanStock.id}`), false, '安全清理后孤立空库存问题应消失')
      assert.ok(remainingIds.has(`STOCK_OWNER_INVALID:${riskyOrphanStock.id}`), '包含余额的孤立库存风险必须保留为人工处理')
      assert.equal(await tx.stock.findUnique({ where: { id: safeOrphanStock.id } }), null, '安全清理应删除孤立空库存记录')
      const detachedConsumption = await tx.dailyProductionConsumption.findUniqueOrThrow({
        where: { id: linkedConsumption.id },
      })
      assert.equal(detachedConsumption.bomItemId, null, '删除 BOM 明细时应保留日报快照并清空失效指针')

      await tx.bOM.update({
        where: { id: bom.id },
        data: {
          status: 'RELEASED',
          isActive: true,
          isDefault: true,
          releasedAt: new Date(),
          outputUnit: 'kg',
        },
      })
      await tx.material.update({ where: { id: raw.id }, data: { stockUnit: 'kg' } })
      const releasedReport = await getDataIntegrityReport(tx)
      const immutableIssue = releasedReport.issues.find(
        (issue) => issue.id === `BOM_UNIT_MISMATCH:${mismatched.id}`,
      )
      const immutableOutputIssue = releasedReport.issues.find(
        (issue) => issue.id === `BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`,
      )
      assert.equal(immutableIssue?.severity, 'WARNING', '已发布 BOM 的投入单位快照差异应为警告')
      assert.equal(immutableIssue?.actions.length, 0, '已发布 BOM 的一致性问题只允许告警，不得原地修复')
      assert.equal(immutableOutputIssue?.severity, 'WARNING', '已发布 BOM 的产出单位快照差异应为警告')
      assert.equal(immutableOutputIssue?.actions.length, 0, '已发布 BOM 的产出单位不得原地修复')
      await assert.rejects(
        () => applyDataIntegrityAction(tx, immutableIssue!.id, 'SYNC_BOM_ITEM_UNIT'),
        /已不存在|不再适用/,
        '维护工具不得绕过已发布 BOM 不可变规则',
      )
      await tx.bOM.update({
        where: { id: bom.id },
        data: { status: 'OBSOLETE', isActive: false, isDefault: false, obsoleteAt: new Date() },
      })
      const obsoleteReport = await getDataIntegrityReport(tx)
      const obsoleteIssue = obsoleteReport.issues.find(
        (issue) => issue.id === `BOM_UNIT_MISMATCH:${mismatched.id}`,
      )
      const obsoleteOutputIssue = obsoleteReport.issues.find(
        (issue) => issue.id === `BOM_OUTPUT_UNIT_MISMATCH:${bom.id}`,
      )
      assert.equal(obsoleteIssue?.severity, 'INFO', '已作废 BOM 的投入单位快照差异应为提示')
      assert.equal(obsoleteIssue?.actions.length, 0, '已作废 BOM 的投入单位不得原地修复')
      assert.equal(obsoleteOutputIssue?.severity, 'INFO', '已作废 BOM 的产出单位快照差异应为提示')
      assert.equal(obsoleteOutputIssue?.actions.length, 0, '已作废 BOM 的产出单位不得原地修复')
      await assert.rejects(
        () => applyDataIntegrityAction(tx, obsoleteIssue!.id, 'SYNC_BOM_ITEM_UNIT'),
        /已不存在|不再适用/,
        '维护工具不得绕过已作废 BOM 不可变规则',
      )

      throw rollbackMarker
    }, { timeout: 20000 })
  } catch (error) {
    if (error !== rollbackMarker) throw error
  }

  console.log('数据关系扫描、故障明细导出、安全修复、受控删除与事务回滚验证通过')
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
