import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-configuration-order-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
process.env.DATABASE_URL = databaseUrl
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const {
      listConfigurationOrder,
      nextConfigurationSortOrder,
      saveConfigurationOrder,
    } = await import('../modules/configuration/server/configuration-order-service')
    const suffix = Date.now().toString(36)

    const supplierOrder = await nextConfigurationSortOrder(prisma, 'suppliers')
    await prisma.supplier.createMany({ data: [
      { code: `ORDER-SUP-A-${suffix}`, name: '排序供应商甲', sortOrder: supplierOrder },
      { code: `ORDER-SUP-B-${suffix}`, name: '排序供应商乙', sortOrder: supplierOrder + 1 },
    ] })
    assert.equal(await nextConfigurationSortOrder(prisma, 'suppliers'), supplierOrder + 2)

    await prisma.customer.createMany({ data: [
      { code: `ORDER-CUS-A-${suffix}`, name: '排序客户甲', sortOrder: 0 },
      { code: `ORDER-CUS-B-${suffix}`, name: '排序客户乙', sortOrder: 1 },
    ] })
    await prisma.employee.createMany({ data: [
      { code: `ORDER-EMP-A-${suffix}`, name: '排序员工甲', sortOrder: 0 },
      { code: `ORDER-EMP-B-${suffix}`, name: '排序员工乙', sortOrder: 1 },
    ] })
    await prisma.workCenter.createMany({ data: [
      { code: `ORDER-WC-A-${suffix}`, name: '排序工作中心甲', sortOrder: 0 },
      { code: `ORDER-WC-B-${suffix}`, name: '排序工作中心乙', sortOrder: 1 },
    ] })
    await prisma.inventoryLocation.createMany({ data: [
      { code: `ORDER-LOC-A-${suffix}`, name: '排序库位甲', sortOrder: 10 },
      { code: `ORDER-LOC-B-${suffix}`, name: '排序库位乙', sortOrder: 11 },
    ] })
    await prisma.processTemplate.createMany({ data: [
      { code: `ORDER-PT-A-${suffix}`, name: '排序工艺甲', category: 'OTHER', sortOrder: 0 },
      { code: `ORDER-PT-B-${suffix}`, name: '排序工艺乙', category: 'OTHER', sortOrder: 1 },
    ] })
    const product = await prisma.product.create({ data: { sku: `ORDER-PRODUCT-${suffix}`, name: '排序验证产品', category: 'FINISHED', unit: '件' } })
    await prisma.processRoute.createMany({ data: [
      { productId: product.id, name: '排序路线甲', sortOrder: 0 },
      { productId: product.id, name: '排序路线乙', sortOrder: 1 },
    ] })

    const entities = ['locations', 'suppliers', 'customers', 'employees', 'workCenters', 'processTemplates', 'processRoutes'] as const
    for (const entity of entities) {
      const before = await listConfigurationOrder(prisma, entity)
      assert.ok(before.length >= 2, `${entity} 应包含可排序记录`)
      const reversedIds = before.map((item) => item.id).reverse()
      const saved = await prisma.$transaction((tx) => saveConfigurationOrder(tx, entity, reversedIds))
      assert.deepEqual(saved.map((item) => item.id), reversedIds, `${entity} 手动顺序应持久化`)
      assert.deepEqual(saved.map((item) => item.sortOrder), saved.map((_, index) => index))
    }

    const units = await listConfigurationOrder(prisma, 'units')
    const groups = Array.from(new Set(units.map((item) => item.group)))
    const reorderedUnitIds = groups.flatMap((group) => units.filter((item) => item.group === group).reverse().map((item) => item.id))
    const savedUnits = await saveConfigurationOrder(prisma, 'units', reorderedUnitIds)
    assert.deepEqual(savedUnits.map((item) => item.id), reorderedUnitIds, '单位应在计量类别内保存手动顺序')

    const invalidUnitOrder = [...reorderedUnitIds]
    const nextGroupIndex = savedUnits.findIndex((item, index) => index > 0 && item.group !== savedUnits[index - 1].group)
    ;[invalidUnitOrder[nextGroupIndex - 1], invalidUnitOrder[nextGroupIndex]] = [invalidUnitOrder[nextGroupIndex], invalidUnitOrder[nextGroupIndex - 1]]
    await assert.rejects(
      saveConfigurationOrder(prisma, 'units', invalidUnitOrder),
      /单位只能在相同计量类别内排序/,
    )

    console.log('配置表头默认顺序、服务器手动排序、单位分组限制和新增顺序验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
