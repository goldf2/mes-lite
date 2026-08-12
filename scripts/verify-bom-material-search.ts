import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'
import { getBomStatusRelationFilters } from '../lib/bom-status-filter'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-bom-search-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function createOutputBom(input: {
  code: string
  materialId: string
  isActive: boolean
  isDefault: boolean
}) {
  const product = await prisma.product.create({
    data: { sku: input.code, name: input.code, category: 'FINISHED', unit: '件' },
  })
  const bom = await prisma.bOM.create({
    data: {
      productId: product.id,
      name: `${input.code} BOM`,
      outputs: { create: { materialId: input.materialId, quantity: 1, unit: '件', isPrimary: true } },
    },
  })
  await prisma.bOM.update({
    where: { id: bom.id },
    data: { status: 'RELEASED', isActive: input.isActive, isDefault: input.isDefault, releasedAt: new Date() },
  })
  if (!input.isActive) return prisma.bOM.update({
    where: { id: bom.id },
    data: { status: 'OBSOLETE', obsoleteAt: new Date() },
  })
  return prisma.bOM.findUniqueOrThrow({ where: { id: bom.id } })
}

async function main() {
  try {
    const suffix = Date.now().toString()
    const [missing, inactive, noDefault, ready] = await Promise.all([
      prisma.material.create({ data: { code: `MISS-${suffix}`, name: '未建 BOM', category: 'FINISHED', unit: '件' } }),
      prisma.material.create({ data: { code: `INACTIVE-${suffix}`, name: '无启用 BOM', category: 'FINISHED', unit: '件' } }),
      prisma.material.create({ data: { code: `NODEFAULT-${suffix}`, name: '无默认 BOM', category: 'FINISHED', unit: '件' } }),
      prisma.material.create({ data: { code: `READY-${suffix}`, name: '可用 BOM', category: 'FINISHED', unit: '件' } }),
    ])

    await Promise.all([
      createOutputBom({ code: inactive.code, materialId: inactive.id, isActive: false, isDefault: false }),
      createOutputBom({ code: noDefault.code, materialId: noDefault.id, isActive: true, isDefault: false }),
      createOutputBom({ code: ready.code, materialId: ready.id, isActive: true, isDefault: true }),
    ])

    const materialIds = [missing.id, inactive.id, noDefault.id, ready.id]
    const findIds = async (status: string) => (await prisma.material.findMany({
      where: {
        id: { in: materialIds },
        AND: getBomStatusRelationFilters(status) as Prisma.MaterialWhereInput[],
      },
      select: { id: true },
    })).map((item) => item.id)

    assert.deepEqual(await findIds('NONE'), [missing.id])
    assert.deepEqual(await findIds('NO_ACTIVE'), [inactive.id])
    assert.deepEqual(await findIds('NO_DEFAULT'), [noDefault.id])
    assert.deepEqual(await findIds('READY'), [ready.id])
    console.log('物料高级搜索可准确区分未建、未启用、未默认和可用 BOM')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
