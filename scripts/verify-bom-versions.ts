import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-bom-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [product, finished, byproduct, raw] = await Promise.all([
      prisma.product.create({
        data: { sku: `VERIFY-FIN-${suffix}`, name: '验证批量产品', category: 'FINISHED', unit: '件' },
      }),
      prisma.material.create({
        data: { code: `VERIFY-FIN-${suffix}`, name: '验证主产出', category: 'FINISHED', unit: '件', stockUnit: '件' },
      }),
      prisma.material.create({
        data: { code: `VERIFY-BY-${suffix}`, name: '验证副产出', category: 'SEMI', unit: 'kg', stockUnit: 'kg' },
      }),
      prisma.material.create({
        data: { code: `VERIFY-RAW-${suffix}`, name: '验证长度原料', category: 'RAW', unit: 'm', stockUnit: 'm' },
      }),
    ])

    const defaultBom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '常规 100 件',
        version: 'v1',
        isDefault: true,
        outputQuantity: 100,
        outputUnit: '件',
        items: {
          create: { itemType: 'MATERIAL', materialId: raw.id, quantity: 3.5, unit: 'm' },
        },
        outputs: {
          create: [
            { materialId: finished.id, quantity: 100, unit: '件', isPrimary: true },
            { materialId: byproduct.id, quantity: 2.5, unit: 'kg', isPrimary: false },
          ],
        },
      },
      include: { items: true, outputs: true },
    })
    const alternateBom = await prisma.bOM.create({
      data: {
        productId: product.id,
        name: '小批量 20 件',
        version: 'v2',
        isDefault: false,
        outputQuantity: 20,
        outputUnit: '件',
        items: {
          create: { itemType: 'MATERIAL', materialId: raw.id, quantity: 0.72, unit: 'm' },
        },
        outputs: {
          create: { materialId: finished.id, quantity: 20, unit: '件', isPrimary: true },
        },
      },
      include: { items: true, outputs: true },
    })

    assert.equal(defaultBom.items[0].quantity / defaultBom.outputQuantity, 0.035)
    assert.equal(alternateBom.items[0].quantity / alternateBom.outputQuantity, 0.036)
    assert.equal(defaultBom.outputs.length, 2)
    assert.equal(defaultBom.outputs.find((output) => output.isPrimary)?.quantity, 100)
    assert.equal(defaultBom.outputs.find((output) => output.materialId === byproduct.id)?.quantity, 2.5)
    assert.notEqual(defaultBom.id, alternateBom.id)

    const boms = await prisma.bOM.findMany({ where: { productId: product.id }, orderBy: { version: 'asc' } })
    assert.deepEqual(boms.map((bom) => bom.version), ['v1', 'v2'])

    await assert.rejects(
      prisma.bOM.create({
        data: { productId: product.id, name: '重复版本', version: 'v2' },
      }),
    )

    console.log('BOM 多方案、多产出、版本唯一性与批量换算验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
