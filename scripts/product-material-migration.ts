import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  applyProductMaterialMapping,
  buildProductMaterialMappingPlan,
  validateProductMaterialMapping,
  type ProductMaterialMappingPlan,
} from '../modules/operations-tools/server/product-material-migration-service'
import { getModelConvergenceAudit } from '../modules/operations-tools/server/model-convergence-audit-service'

const root = path.resolve(process.env.MES_LITE_APP_ROOT || process.cwd())

function parseArgs(values: string[]) {
  const [command, ...rest] = values
  const options: Record<string, string> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index]
    const value = rest[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`参数无效：${key || ''}`)
    options[key.slice(2)] = value
    index += 1
  }
  return { command, options }
}

function databasePathFromUrl(databaseUrl: string) {
  if (!databaseUrl.startsWith('file:')) throw new Error('阶段 1B-2 映射工具当前只支持 SQLite file: DATABASE_URL')
  const value = decodeURIComponent(databaseUrl.slice('file:'.length).split('?')[0])
  return path.resolve(root, 'prisma', value)
}

async function sha256File(filePath: string) {
  const handle = await open(filePath, 'r')
  const hash = createHash('sha256')
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk))
  } finally {
    await handle.close()
  }
  return hash.digest('hex')
}

async function writeNewJson(filePath: string, value: unknown) {
  const absolutePath = path.resolve(filePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  return absolutePath
}

async function reserveReport(filePath: string, value: unknown) {
  const absolutePath = path.resolve(filePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  return absolutePath
}

async function replaceReservedReport(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (!['audit', 'plan', 'preflight', 'apply'].includes(command || '')) {
    throw new Error('用法：product-material-migration <audit|plan|preflight|apply> [--report <file>] [--mapping <file> --backup-dir <dir> --uploads <dir>]')
  }
  if (command === 'audit' && !options.report) throw new Error('audit 必须提供 --report')
  if (command === 'preflight' && !options.report) throw new Error('preflight 必须提供 --report')
  if (command !== 'audit' && !options.mapping) throw new Error(`${command} 必须提供 --mapping`)
  const databaseUrl = process.env.DATABASE_URL || ''
  const databasePath = databasePathFromUrl(databaseUrl)
  const databaseStat = await stat(databasePath).catch(() => null)
  if (!databaseStat?.isFile() || databaseStat.size === 0) throw new Error('SQLite 数据库不存在或为空')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    if (command === 'audit') {
      const audit = await getModelConvergenceAudit(prisma)
      const reportPath = await writeNewJson(options.report, {
        format: 'mes-lite-model-convergence-audit',
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        databasePath,
        audit,
      })
      console.log(JSON.stringify({ command, reportPath, readyForProductForeignKeyMigration: audit.readyForProductForeignKeyMigration }))
      return
    }
    if (command === 'plan') {
      const plan = await buildProductMaterialMappingPlan(prisma)
      const mappingPath = await writeNewJson(options.mapping!, plan)
      console.log(JSON.stringify({ command, mappingPath, products: plan.products.length }))
      return
    }

    if (command === 'preflight') {
      const reportPath = path.resolve(options.report)
      if (await stat(reportPath).catch(() => null)) throw new Error('预检报告必须写入不存在的新文件，不允许覆盖')
      const mappingPath = path.resolve(options.mapping!)
      const mappingSource = await readFile(mappingPath, 'utf8')
      const mappingSha256 = await sha256File(mappingPath)
      const databaseSha256Before = await sha256File(databasePath)
      try {
        const mapping = JSON.parse(mappingSource) as ProductMaterialMappingPlan
        const validated = await validateProductMaterialMapping(prisma, mapping)
        const databaseSha256After = await sha256File(databasePath)
        if (databaseSha256After !== databaseSha256Before) {
          throw new Error('预检期间数据库文件发生变化，请停止写入后重新生成映射并预检')
        }
        await writeNewJson(reportPath, {
          format: 'mes-lite-product-material-preflight',
          formatVersion: 1,
          status: 'PASS',
          generatedAt: new Date().toISOString(),
          readyForApply: true,
          databasePath,
          databaseSha256Before,
          databaseSha256After,
          mappingPath,
          mappingSha256,
          validated,
        })
        console.log(JSON.stringify({
          command,
          status: 'PASS',
          readyForApply: true,
          reportPath,
          databaseSha256Before,
          databaseSha256After,
        }))
      } catch (error) {
        const databaseSha256After = await sha256File(databasePath)
        await writeNewJson(reportPath, {
          format: 'mes-lite-product-material-preflight',
          formatVersion: 1,
          status: 'FAILED',
          generatedAt: new Date().toISOString(),
          readyForApply: false,
          databasePath,
          databaseSha256Before,
          databaseSha256After,
          mappingPath,
          mappingSha256,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      return
    }

    if (!options.report || !options['backup-dir'] || !options.uploads) {
      throw new Error('apply 必须提供 --report、--backup-dir 和 --uploads，确保先备份数据库与附件')
    }
    if (options['maintenance-confirmation'] !== 'STOPPED_SINGLE_INSTANCE') {
      throw new Error('apply 必须提供 --maintenance-confirmation STOPPED_SINGLE_INSTANCE，确认应用已停止且只有一个实例')
    }
    const reportPath = path.resolve(options.report)
    const mappingPath = path.resolve(options.mapping!)
    const backupDirectory = path.resolve(options['backup-dir'])
    const uploadRoot = path.resolve(options.uploads)
    await access(uploadRoot)
    if (await stat(reportPath).catch(() => null)) throw new Error('迁移报告必须写入不存在的新文件，不允许覆盖')
    const mappingSource = await readFile(mappingPath, 'utf8')
    const mapping = JSON.parse(mappingSource) as ProductMaterialMappingPlan
    const mappingSha256 = await sha256File(mappingPath)
    const before = await getModelConvergenceAudit(prisma)
    await reserveReport(reportPath, {
      format: 'mes-lite-product-material-migration-report',
      formatVersion: 1,
      status: 'STARTED',
      startedAt: new Date().toISOString(),
      databasePath,
      mappingPath,
      mappingSha256,
      before,
    })

    let backup: Record<string, unknown> | undefined
    let mappingTransactionCompleted = false
    try {
      const backupOutput = execFileSync(process.execPath, [
        path.join(root, 'scripts/runtime-backup.mjs'), 'create',
        '--database', databasePath, '--uploads', uploadRoot, '--backup-dir', backupDirectory,
      ], { cwd: root, encoding: 'utf8' }).trim()
      backup = JSON.parse(backupOutput)
      if (!backup) throw new Error('备份命令未返回结果')
      const applied = await applyProductMaterialMapping(prisma, mapping)
      mappingTransactionCompleted = true
      const after = await getModelConvergenceAudit(prisma)
      if (!after.readyForProductForeignKeyMigration) {
        throw new Error(`回填后审计仍有阻塞：${after.blockers.join('；')}`)
      }
      const result = {
        format: 'mes-lite-product-material-migration-report',
        formatVersion: 1,
        status: 'COMPLETE',
        createdAt: new Date().toISOString(),
        databasePath,
        mappingPath,
        mappingSha256,
        backup: {
          archivePath: backup.archivePath,
          sha256: backup.sha256,
          createdAt: backup.createdAt,
          databaseQuickCheck: backup.databaseQuickCheck,
          attachmentRows: backup.attachmentRows,
        },
        confirmation: { confirmedBy: applied.confirmedBy, confirmedAt: applied.confirmedAt },
        before,
        applied,
        after,
        rollback: {
          method: '停止应用后，使用报告中的 backup.archivePath 执行非覆盖 stage-restore，再切换 data/uploads 挂载。',
          directReverseMigration: false,
        },
      }
      await replaceReservedReport(reportPath, result)
      console.log(JSON.stringify({ command, reportPath, backup: result.backup, changed: applied.changed }))
    } catch (error) {
      await replaceReservedReport(reportPath, {
        format: 'mes-lite-product-material-migration-report',
        formatVersion: 1,
        status: 'FAILED',
        failedAt: new Date().toISOString(),
        databasePath,
        mappingPath,
        mappingSha256,
        before,
        backup: backup || null,
        mappingTransactionCompleted,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(`Product→Material 迁移操作失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
