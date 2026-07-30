import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import {
  applyMaterialCodeNormalization,
  buildMaterialCodeNormalizationPreview,
  normalizeMaterialCode,
} from '../lib/material-code-normalization'

const rollbackMarker = new Error('VERIFY_MATERIAL_CODE_NORMALIZATION_ROLLBACK')

async function main() {
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
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})
