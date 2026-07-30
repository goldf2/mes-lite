import { PrismaClient } from '@prisma/client'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const migrationName = '20260730163000_link_work_instructions_to_material'
const prisma = new PrismaClient()

async function migrationAlreadyApplied() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name" = ? LIMIT 1',
      migrationName,
    )
    return Array.isArray(rows) && rows.length > 0 && rows[0].finished_at
  } catch {
    return false
  }
}

try {
  if (!(await migrationAlreadyApplied())) {
    const legacyDirectory = path.resolve(process.cwd(), 'public', 'uploads', 'WORK_INSTRUCTION')
    await rm(legacyDirectory, { recursive: true, force: true })
    console.log(`Removed legacy product document files before ${migrationName}.`)
  }
} finally {
  await prisma.$disconnect()
}
