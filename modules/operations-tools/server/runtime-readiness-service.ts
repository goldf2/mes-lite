import { constants } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { attachmentUploadRoot } from '@/lib/attachment-storage'
import { prisma } from '@/lib/prisma'

export type RuntimeReadinessCheck = {
  status: 'pass' | 'warn' | 'fail'
  message: string
}

export type RuntimeReadiness = {
  status: 'ready' | 'unready'
  checks: Record<string, RuntimeReadinessCheck>
}

function runtimeDataDirectory() {
  if (process.env.MES_LITE_DATA_DIR) return path.resolve(process.env.MES_LITE_DATA_DIR)
  const databaseUrl = process.env.DATABASE_URL || ''
  if (databaseUrl.startsWith('file:/')) return path.dirname(path.resolve(databaseUrl.slice('file:'.length)))
  return path.resolve(process.cwd(), 'prisma')
}

async function writableDirectoryCheck(directory: string, label: string): Promise<RuntimeReadinessCheck> {
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error('not a directory')
    await access(directory, constants.R_OK | constants.W_OK)
    return { status: 'pass', message: `${label}可读写` }
  } catch (error) {
    console.error(`${label}就绪检查失败:`, error)
    return { status: 'fail', message: `${label}不可读写` }
  }
}

async function databaseCheck(): Promise<RuntimeReadinessCheck> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1 AS ok')
    return { status: 'pass', message: 'SQLite 查询正常' }
  } catch (error) {
    console.error('SQLite 就绪检查失败:', error)
    return { status: 'fail', message: 'SQLite 不可用' }
  }
}

async function migrationCheck(): Promise<RuntimeReadinessCheck> {
  try {
    const migrationDirectory = path.join(process.cwd(), 'prisma', 'migrations')
    const expectedMigrations = (await readdir(migrationDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d{14}_.+/.test(entry.name))
      .map((entry) => entry.name)
    const rows = await prisma.$queryRawUnsafe<Array<{
      migration_name: string
      finished_at: Date | string | null
      rolled_back_at: Date | string | null
    }>>(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
    )
    const applied = new Set(rows
      .filter((row) => row.finished_at && !row.rolled_back_at)
      .map((row) => row.migration_name))
    const failed = rows.filter((row) => !row.finished_at && !row.rolled_back_at).length
    const pending = expectedMigrations.filter((migration) => !applied.has(migration))
    if (failed > 0 || pending.length > 0) {
      return { status: 'fail', message: `Prisma 迁移未就绪：${failed} 条失败，${pending.length} 条待应用` }
    }
    return { status: 'pass', message: `Prisma 迁移已全部应用（${expectedMigrations.length}）` }
  } catch (error) {
    console.error('Prisma 迁移就绪检查失败:', error)
    return { status: 'fail', message: '无法确认 Prisma 迁移状态' }
  }
}

async function backupFreshnessCheck(): Promise<RuntimeReadinessCheck> {
  const backupDirectory = process.env.MES_LITE_BACKUP_DIR
  if (!backupDirectory) return { status: 'warn', message: '未配置持久化备份目录' }
  const configuredMaxAgeHours = Number(process.env.MES_LITE_BACKUP_MAX_AGE_HOURS || 26)
  const maxAgeHours = Number.isFinite(configuredMaxAgeHours) && configuredMaxAgeHours > 0
    ? configuredMaxAgeHours
    : 26
  try {
    const entries = await readdir(path.resolve(backupDirectory), { withFileTypes: true })
    const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name))
    const archives = entries.filter((entry) => entry.isFile()
      && entry.name.startsWith('mes-lite-backup-') && entry.name.endsWith('.tar.gz')
      && fileNames.has(`${entry.name}.sha256`))
    if (archives.length === 0) return { status: 'warn', message: '尚无可验证运行时备份' }
    const modifiedTimes = await Promise.all(archives.map(async (entry) => (
      await stat(path.join(path.resolve(backupDirectory), entry.name))
    ).mtimeMs))
    const ageHours = (Date.now() - Math.max(...modifiedTimes)) / (60 * 60 * 1000)
    return ageHours <= maxAgeHours
      ? { status: 'pass', message: '最近备份在时效内' }
      : { status: 'warn', message: `最近备份已超过 ${maxAgeHours} 小时` }
  } catch (error) {
    console.error('备份时效检查失败:', error)
    return { status: 'warn', message: '无法读取备份目录' }
  }
}

export async function evaluateRuntimeReadiness(): Promise<RuntimeReadiness> {
  const checks = {
    database: await databaseCheck(),
    migrations: await migrationCheck(),
    dataStorage: await writableDirectoryCheck(runtimeDataDirectory(), '数据目录'),
    attachmentStorage: await writableDirectoryCheck(attachmentUploadRoot(), '附件目录'),
    backupFreshness: await backupFreshnessCheck(),
  }
  return {
    status: Object.values(checks).some((check) => check.status === 'fail') ? 'unready' : 'ready',
    checks,
  }
}
