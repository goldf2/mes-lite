import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const rollbackMarker = new Error('VERIFY_MATERIAL_CODE_NORMALIZATION_ROLLBACK')
const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-material-code-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, { applyMaterialCodeNormalization, buildMaterialCodeNormalizationPreview, normalizeMaterialCode }] = await Promise.all([
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

  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
  const beforeCode = ` verify ${suffix} a `
  const afterCode = `VERIFY${suffix}A`
  const beforeSku = `MAT-${beforeCode}`
  const afterSku = `MAT-${afterCode}`

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
        [{ id: product.id, sku: product.sku }],
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

      throw rollbackMarker
    })
  } catch (error) {
    if (error !== rollbackMarker) throw error
  }

  assert.equal(await prisma.material.count({ where: { code: { in: [beforeCode, afterCode] } } }), 0)
  assert.equal(await prisma.product.count({ where: { sku: { in: [beforeSku, afterSku] } } }), 0)

  console.log('物料编码规范化验证通过：删除全部空白、统一大写、冲突拦截、关联产品编码同步和事务回滚均符合预期。')
  await prisma.$disconnect()
  rmSync(verifyRoot, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
