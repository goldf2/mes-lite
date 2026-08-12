import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-bom-lifecycle-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const { prisma } = await import('../lib/prisma')
  const { BomDomainError } = await import('../modules/bom/domain/bom-errors')
  const { saveBom } = await import('../modules/bom/server/bom-command-service')
  const { copyBomVersion, obsoleteBomVersion, releaseBomVersion } = await import('../modules/bom/server/bom-lifecycle-service')
  const { listProductionOrderOptions } = await import('../modules/production/server/production-order-query-service')

  try {
    const suffix = Date.now().toString()
    const [output, input] = await Promise.all([
      prisma.material.create({ data: { code: `OUT-${suffix}`, name: '生命周期产出', category: 'FINISHED', unit: '件', stockUnit: '件' } }),
      prisma.material.create({ data: { code: `IN-${suffix}`, name: '生命周期投入', category: 'RAW', unit: '件', stockUnit: '件' } }),
    ])
    const product = await prisma.product.create({ data: { sku: `MAT-${output.code}`, name: output.name, category: 'FINISHED', unit: '件' } })
    const draft = await prisma.bOM.create({
      data: {
        productId: product.id, name: '验证草稿', version: 'v1', status: 'DRAFT', isActive: false, isDefault: false,
        items: { create: { materialId: input.id, quantity: 2, unit: '件' } },
        outputs: { create: { materialId: output.id, quantity: 1, unit: '件', isPrimary: true } },
      },
    })

    assert.deepEqual(await listProductionOrderOptions(), [], '草稿 BOM 不得进入生产订单候选')
    const releasedV1 = await releaseBomVersion(draft.id, 'tester')
    assert.equal(releasedV1.status, 'RELEASED')
    assert.equal(releasedV1.isDefault, true)
    assert.equal(releasedV1.isActive, true)
    await assert.rejects(
      prisma.bOM.update({ where: { id: draft.id }, data: { name: '试图绕过领域服务' } }),
      /不可修改|constraint|invocation/i,
      '数据库必须阻止直接改写已发布 BOM 主体',
    )
    await assert.rejects(
      prisma.bOM.update({ where: { id: draft.id }, data: { status: 'DRAFT' } }),
      /不可回退|constraint|invocation/i,
      '数据库必须阻止已发布 BOM 回退成可编辑草稿',
    )
    await assert.rejects(
      prisma.bOMItem.create({ data: { bomId: draft.id, materialId: input.id, quantity: 1, unit: '件' } }),
      /不可修改|constraint|invocation/i,
      '数据库必须阻止直接改写已发布 BOM 明细',
    )
    await assert.rejects(() => releaseBomVersion(draft.id), BomDomainError, '已发布版本不得重复发布')
    await assert.rejects(() => saveBom({
      productId: product.id,
      bomId: draft.id,
      createNew: false,
      name: '不允许覆盖已发布版本',
      purpose: 'PRODUCTION',
      isActive: true,
      outputQuantity: 1,
      outputs: [{ materialId: output.id, quantity: 1, entryUnit: '件', isPrimary: true }],
      items: [{ materialId: input.id, quantity: 2, entryUnit: '件', wastageRate: 0 }],
    }), /不可修改/, '已发布版本必须由命令服务阻止原地修改')

    const copied = await copyBomVersion(draft.id, '验证版本派生')
    assert.equal(copied.version, 'v2')
    assert.equal(copied.status, 'DRAFT')
    assert.equal(copied.basedOnBomId, draft.id)
    assert.equal(copied.items.length, 1)
    assert.equal(copied.outputs.length, 1)
    const releasedV2 = await releaseBomVersion(copied.id, 'tester')
    assert.equal(releasedV2.isDefault, true)
    assert.equal((await prisma.bOM.findUniqueOrThrow({ where: { id: draft.id } })).isDefault, false)

    const obsoleteV1 = await obsoleteBomVersion(draft.id, 'tester')
    assert.equal(obsoleteV1.status, 'OBSOLETE')
    assert.equal(obsoleteV1.isActive, false)
    const options = await listProductionOrderOptions()
    assert.deepEqual(options.flatMap((item) => item.boms.map((bom) => bom.version)), ['v2'], '生产订单只允许选择已发布且未作废版本')

    await assert.rejects(
      prisma.bOM.create({ data: { productId: product.id, name: '重复版本', version: 'v2' } }),
      /Unique constraint/,
      '同一产品的 BOM 版本号必须唯一',
    )
    console.log('BOM 草稿、发布、只读派生、作废、默认版本和生产引用闭环验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
