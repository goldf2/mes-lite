import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-stock-owner-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const migration = readFileSync(
  join(root, 'prisma/migrations/20260815234500_enforce_stock_owner_invariant/migration.sql'),
  'utf8',
)

assert.match(migration, /__StockOwnerMigrationGuard/, '迁移前必须扫描历史非法库存归属')
assert.match(migration, /Stock_owner_insert_guard/, '数据库必须阻止新建非法库存归属')
assert.match(migration, /Stock_owner_update_guard/, '数据库必须阻止更新形成非法库存归属')

const invalidDatabasePath = join(verifyRoot, 'invalid-existing-stock.db')
execFileSync('sqlite3', [invalidDatabasePath, `
  CREATE TABLE "Stock" ("id" TEXT PRIMARY KEY, "materialId" TEXT, "productId" TEXT);
  INSERT INTO "Stock" ("id", "materialId", "productId") VALUES ('invalid-owner', NULL, NULL);
`])
const rejectedMigration = spawnSync('sqlite3', [invalidDatabasePath], {
  input: migration,
  encoding: 'utf8',
})
assert.notEqual(rejectedMigration.status, 0, '历史库存在非法库存归属时迁移必须停止')
assert.match(rejectedMigration.stderr, /CHECK constraint failed/, '迁移失败原因必须来自归属预检门禁')

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

function isDatabaseConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const material = await prisma.material.create({
    data: {
      code: `OWNER-M-${suffix}`,
      name: '库存归属验证物料',
      category: 'FINISHED',
      unit: '件',
      stockUnit: '件',
    },
  })
  const secondMaterial = await prisma.material.create({
    data: {
      code: `OWNER-M2-${suffix}`,
      name: '库存归属验证物料二',
      category: 'FINISHED',
      unit: '件',
      stockUnit: '件',
    },
  })
  const product = await prisma.product.create({
    data: {
      sku: `OWNER-P-${suffix}`,
      name: '库存归属验证兼容产品',
      category: 'FINISHED',
      unit: '件',
    },
  })

  const materialStock = await prisma.stock.create({ data: { materialId: material.id } })
  const productStock = await prisma.stock.create({ data: { productId: product.id } })

  await assert.rejects(
    prisma.stock.create({ data: {} }),
    isDatabaseConstraintError,
    '数据库必须拒绝无归属库存',
  )
  await assert.rejects(
    prisma.stock.create({ data: { materialId: secondMaterial.id, productId: product.id } }),
    isDatabaseConstraintError,
    '数据库必须拒绝双归属库存',
  )
  await assert.rejects(
    prisma.stock.update({ where: { id: materialStock.id }, data: { productId: product.id } }),
    isDatabaseConstraintError,
    '数据库必须拒绝把单归属库存改成双归属',
  )
  await assert.rejects(
    prisma.stock.update({ where: { id: materialStock.id }, data: { materialId: null } }),
    isDatabaseConstraintError,
    '数据库必须拒绝清空唯一库存归属',
  )

  const migrated = await prisma.stock.update({
    where: { id: productStock.id },
    data: { productId: null, materialId: secondMaterial.id },
  })
  assert.equal(migrated.productId, null, 'Product-only 库存应允许原子迁移到 Material')
  assert.equal(migrated.materialId, secondMaterial.id, '迁移后的库存必须归属目标 Material')

  const invalidCount = await prisma.stock.count({
    where: {
      OR: [
        { materialId: null, productId: null },
        { materialId: { not: null }, productId: { not: null } },
      ],
    },
  })
  assert.equal(invalidCount, 0, '验证结束后不得存在非法库存归属')

  console.log('库存所有者迁移门禁、写入触发器和 Product→Material 原子切换验证通过')
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
