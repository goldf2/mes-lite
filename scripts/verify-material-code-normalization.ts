import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transformSync } from 'esbuild'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MaterialCodeNormalizationPreview } from '../modules/operations-tools/contracts/maintenance'
const rollbackMarker = new Error('VERIFY_MATERIAL_CODE_NORMALIZATION_ROLLBACK')
const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-material-code-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function renderNormalizationPreview(preview: MaterialCodeNormalizationPreview, canUpdate = true) {
  const require = createRequire(import.meta.url)
  const componentModule = { exports: {} as { default: React.ComponentType<{ onMessage: () => void; canUpdate: boolean; canDelete: boolean }> } }
  const states: unknown[] = [preview, false, false]
  let stateIndex = 0
  const source = readFileSync(join(root, 'modules/operations-tools/ui/DataToolsPage.tsx'), 'utf8')
  const compiled = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code
  const componentRequire = (id: string) => {
    if (id === 'react') return {
      ...React,
      useState: () => [states[stateIndex++], () => {}],
      useCallback: (callback: unknown) => callback,
      useEffect: () => {},
    }
    if (id === '@/app/components/AppButton') return function AppButtonMock({ children, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
      return React.createElement('button', { disabled }, children)
    }
    if (id === './DataIntegrityPanel' || id === './ImageOptimizationPanel') return () => null
    if (id === '../client/maintenance-api') return {}
    return require(id)
  }
  new Function('module', 'exports', 'require', compiled)(componentModule, componentModule.exports, componentRequire)
  return renderToStaticMarkup(React.createElement(componentModule.exports.default, { onMessage: () => {}, canUpdate, canDelete: false }))
}

async function main() {
  const [{ prisma }, { applyMaterialCodeNormalization, buildMaterialCodeNormalizationPreview, getMaterialCodeNormalizationPreview, normalizeMaterialCode }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/operations-tools/server/material-code-normalization-service'),
  ])
  assert.equal(normalizeMaterialCode(' p12- 34 a '), 'P12-34A')
  assert.equal(normalizeMaterialCode('\tp12\n34\r'), 'P1234')
  assert.equal(normalizeMaterialCode('Ｐ１２-a'), 'Ｐ１２-A')

  const conflictPreview = buildMaterialCodeNormalizationPreview(
    [
      { id: 'm1', code: 'ab c', name: '测试 1', deletedAt: null },
      { id: 'm2', code: 'A BC', name: '测试 2', deletedAt: null },
      { id: 'm3', code: '   ', name: '测试 3', deletedAt: null },
    ],
    [],
  )
  assert.equal(conflictPreview.canExecute, false)
  assert.equal(conflictPreview.materialConflicts[0].normalizedCode, 'ABC')
  assert.equal(conflictPreview.invalidMaterials.length, 1)

  const materialRow = (id: string, code: string, deletedAt: Date | null = null) => ({ id, code, name: id, deletedAt })
  const productRow = (id: string, sku: string, materialId: string | null = null) => ({ id, sku, materialId })
  const productOnlyPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A')], [productRow('p1', 'MAT-FG-A')],
  )
  assert.equal(productOnlyPreview.canExecute, true)
  assert.equal(productOnlyPreview.pendingMaterialCount, 0)
  assert.equal(productOnlyPreview.pendingProductCount, 1, '仅旧 Product 编码需要统一时也必须出现在预览')
  assert.equal(productOnlyPreview.productChanges[0].after, 'FG-A')
  assert.equal(productOnlyPreview.productChanges[0].materialId, 'm1')
  const productOnlyHtml = renderNormalizationPreview(productOnlyPreview)
  assert.match(productOnlyHtml, /<button>执行编码统一<\/button>/, '仅 Product 待同步时必须允许执行')
  assert.match(productOnlyHtml, /MAT-FG-A/)
  assert.match(productOnlyHtml, /目标物料编码/)
  assert.match(productOnlyHtml, /FG-A<\/td>/, '产品同步预览必须显示目标物料')
  assert.doesNotMatch(productOnlyHtml, /当前没有待转换/)
  assert.match(renderNormalizationPreview(productOnlyPreview, false), /<button disabled="">/, '无修改权限时不能执行')

  const bindingOnlyPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A')], [productRow('p1', 'FG-A')],
  )
  assert.equal(bindingOnlyPreview.pendingProductCount, 1, '编码相同时仍需补齐唯一无歧义的显式关联')
  assert.match(renderNormalizationPreview(bindingOnlyPreview), /编码已一致，补齐物料关联/)
  const explicitPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A'), materialRow('m2', 'MAT-FG-A')],
    [productRow('p1', 'MAT-FG-A', 'm1')],
  )
  assert.equal(explicitPreview.canExecute, true)
  assert.equal(explicitPreview.productChanges[0].after, 'FG-A', '显式 materialId 优先于同码候选')

  const literalPrefixPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A'), materialRow('m2', 'MAT-FG-A')],
    [productRow('p1', 'MAT-MAT-FG-A', 'm2')],
  )
  assert.equal(literalPrefixPreview.productChanges[0].after, 'MAT-FG-A', '真实物料编码中的 MAT- 必须保留')
  const literalUnboundPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'MAT-FG-A')], [productRow('p1', 'MAT-FG-A')],
  )
  assert.equal(literalUnboundPreview.productChanges[0].after, 'MAT-FG-A')

  const ambiguousPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A'), materialRow('m2', 'MAT-FG-A')],
    [productRow('p1', 'MAT-FG-A')],
  )
  assert.equal(ambiguousPreview.canExecute, false)
  assert.deepEqual(ambiguousPreview.ambiguousProducts[0].materialCodes, ['FG-A', 'MAT-FG-A'])
  assert.equal(ambiguousPreview.productChanges.length, 0)
  assert.match(renderNormalizationPreview(ambiguousPreview), /<button disabled="">/, '映射冲突时必须禁用执行按钮')
  const completePreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A')], [productRow('p1', 'FG-A', 'm1')],
  )
  assert.match(renderNormalizationPreview(completePreview), /当前没有待转换/)
  assert.match(renderNormalizationPreview(completePreview), /<button disabled="">/)
  const archivedAmbiguityPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A'), materialRow('m2', 'MAT-FG-A', new Date())],
    [productRow('p1', 'MAT-FG-A')],
  )
  assert.equal(archivedAmbiguityPreview.canExecute, false, '候选检查必须包含已归档物料，不能隐藏同码歧义')

  const duplicateClaimPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A')],
    [productRow('p1', 'FG-A', 'm1'), productRow('p2', 'MAT-FG-A')],
  )
  assert.equal(duplicateClaimPreview.canExecute, false)
  assert.equal(duplicateClaimPreview.productConflicts[0].normalizedSku, 'FG-A')
  assert.equal(duplicateClaimPreview.productConflicts[0].products.length, 2)
  const occupiedPreview = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A'), materialRow('m2', 'FG-B')],
    [productRow('p1', 'OLD-A', 'm1'), productRow('p2', 'FG-A', 'm2')],
  )
  assert.equal(occupiedPreview.canExecute, false, '目标编码被其他 Product 占用时必须预览阻断')
  assert.equal(occupiedPreview.productConflicts[0].normalizedSku, 'FG-A')

  const missingExplicitTarget = buildMaterialCodeNormalizationPreview(
    [materialRow('m1', 'FG-A')], [productRow('p1', 'FG-A', 'missing-material')],
  )
  assert.equal(missingExplicitTarget.productChanges.length, 0, '无效显式关联也不得按编码重绑')

  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  const beforeCode = ` verify ${suffix} a `
  const afterCode = `VERIFY${suffix}A`
  const beforeSku = `MAT-${beforeCode}`
  const afterSku = afterCode

  try {
    await prisma.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: {
          code: beforeCode,
          name: '编码规范化验证物料',
          category: 'RAW',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
        },
      })
      const product = await tx.product.create({
        data: {
          sku: beforeSku,
          name: '编码规范化验证产品',
          category: 'RAW',
          unit: '件',
        },
      })

      const preview = buildMaterialCodeNormalizationPreview(
        [{ id: material.id, code: material.code, name: material.name, deletedAt: null }],
        [{ id: product.id, sku: product.sku, materialId: product.materialId }],
      )
      assert.equal(preview.canExecute, true)
      assert.equal(preview.changes[0].after, afterCode)
      assert.equal(preview.productChanges[0].after, afterSku)

      const applied = await applyMaterialCodeNormalization(tx, preview)
      assert.equal(applied.changedMaterials, 1)
      assert.equal(applied.changedProducts, 1)

      const [updatedMaterial, updatedProduct] = await Promise.all([
        tx.material.findUniqueOrThrow({ where: { id: material.id } }),
        tx.product.findUniqueOrThrow({ where: { id: product.id } }),
      ])
      assert.equal(updatedMaterial.code, afterCode)
      assert.equal(updatedProduct.sku, afterSku)
      assert.equal(updatedProduct.materialId, material.id)

      const route = await tx.processRoute.create({ data: { productId: product.id, name: '历史路线' } })
      const order = await tx.productionOrder.create({ data: { orderNo: `VERIFY-${suffix}`, productId: product.id, planQty: 1 } })
      const renamedCode = `RENAMED${suffix}`
      await tx.material.update({ where: { id: material.id }, data: { code: renamedCode } })
      const linkedPreview = await getMaterialCodeNormalizationPreview(tx)
      assert.equal(linkedPreview.pendingMaterialCount, 0)
      assert.equal(linkedPreview.pendingProductCount, 1)
      assert.equal(linkedPreview.productChanges[0].after, renamedCode)
      await applyMaterialCodeNormalization(tx, linkedPreview)
      assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).sku, renamedCode)
      assert.equal((await tx.processRoute.findUniqueOrThrow({ where: { id: route.id } })).productId, product.id)
      assert.equal((await tx.productionOrder.findUniqueOrThrow({ where: { id: order.id } })).productId, product.id)
      assert.equal((await getMaterialCodeNormalizationPreview(tx)).pendingProductCount, 0, '重复执行应无待变更记录')

      await tx.product.create({ data: { sku: `MAT-${renamedCode}`, name: '冲突旧产品', category: 'RAW', unit: '件' } })
      const blockedPreview = await getMaterialCodeNormalizationPreview(tx)
      assert.equal(blockedPreview.canExecute, false)
      await assert.rejects(() => applyMaterialCodeNormalization(tx, blockedPreview), /存在冲突/)
      assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).sku, renamedCode)

      throw rollbackMarker
    })
  } catch (error) {
    if (error !== rollbackMarker) throw error
  }

  assert.equal(await prisma.material.count({ where: { code: { in: [beforeCode, afterCode] } } }), 0)
  assert.equal(await prisma.product.count({ where: { sku: { in: [beforeSku, afterSku] } } }), 0)

  console.log('物料编码规范化验证通过：统一编码与关联、仅 Product 预览及操作状态、歧义和占用阻断、历史引用保留、幂等和事务回滚均符合预期。')
  await prisma.$disconnect()
  rmSync(verifyRoot, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
