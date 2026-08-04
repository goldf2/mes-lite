import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-equipment-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const ids: { workCenter?: string; equipment?: string; material?: string; category?: string; instruction?: string } = {}

async function main() {
  try {
    const workCenter = await prisma.workCenter.create({
      data: { code: `VERIFY-WC-${suffix}`, name: '验证工作中心', category: '锯切' },
    })
    ids.workCenter = workCenter.id

    const equipment = await prisma.equipment.create({
      data: {
        code: `VERIFY-EQ-${suffix}`,
        name: '验证设备',
        equipmentType: '锯床',
        workCenterId: workCenter.id,
        basicParameters: '最大加工尺寸：验证值',
      },
      include: { workCenter: true },
    })
    ids.equipment = equipment.id
    assert.equal(equipment.workCenter.id, workCenter.id)

    const material = await prisma.material.create({
      data: { code: `VERIFY-MAT-${suffix}`, name: '验证产品', category: 'FINISHED', unit: '件' },
    })
    ids.material = material.id
    const category = await prisma.documentCategory.create({
      data: { name: `验证工艺文件-${suffix}` },
    })
    ids.category = category.id
    const instruction = await prisma.workInstruction.create({
      data: {
        title: '设备工作中心文档验证',
        materialId: material.id,
        categoryId: category.id,
        workCenters: { connect: { id: workCenter.id } },
      },
      include: { workCenters: true },
    })
    ids.instruction = instruction.id
    assert.deepEqual(instruction.workCenters.map((item) => item.id), [workCenter.id])

    console.log('工作中心、设备归属与工艺文档适用关系验证通过')
  } finally {
    if (ids.instruction) await prisma.workInstruction.delete({ where: { id: ids.instruction } }).catch(() => undefined)
    if (ids.equipment) await prisma.equipment.delete({ where: { id: ids.equipment } }).catch(() => undefined)
    if (ids.workCenter) await prisma.workCenter.delete({ where: { id: ids.workCenter } }).catch(() => undefined)
    if (ids.category) await prisma.documentCategory.delete({ where: { id: ids.category } }).catch(() => undefined)
    if (ids.material) await prisma.material.delete({ where: { id: ids.material } }).catch(() => undefined)
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
