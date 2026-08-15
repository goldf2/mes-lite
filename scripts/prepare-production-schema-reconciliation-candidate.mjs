import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function parseArgs(values) {
  const options = {}
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`参数无效：${key || ''}`)
    options[key.slice(2)] = value
    index += 1
  }
  for (const required of ['database', 'audit', 'target', 'archive', 'report', 'operator']) {
    if (!options[required]) throw new Error(`缺少参数 --${required}`)
  }
  return options
}

async function sha256File(filePath) {
  const handle = await open(filePath, 'r')
  const hash = createHash('sha256')
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk))
  } finally {
    await handle.close()
  }
  return hash.digest('hex')
}

function sqlite(databasePath, args, input) {
  const result = spawnSync('sqlite3', args(databasePath), {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`SQLite 操作失败：${result.stderr.trim() || result.stdout.trim()}`)
  return result.stdout
}

function sqliteJson(databasePath, sql) {
  const output = sqlite(databasePath, (resolvedPath) => ['-readonly', '-json', resolvedPath, sql]).trim()
  return output ? JSON.parse(output) : []
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function createStableCandidateSnapshot(databasePath, temporaryRoot, partialPath) {
  const candidates = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
  const evidence = []
  for (const sourcePath of candidates) {
    const metadata = await stat(sourcePath).catch(() => null)
    if (!metadata?.isFile()) continue
    const sha256 = await sha256File(sourcePath)
    const copiedPath = path.join(temporaryRoot, path.basename(sourcePath))
    await copyFile(sourcePath, copiedPath)
    if (await sha256File(copiedPath) !== sha256 || await sha256File(sourcePath) !== sha256) {
      throw new Error(`证据文件复制期间发生变化：${sourcePath}`)
    }
    evidence.push({ sourcePath, copiedPath, bytes: metadata.size, sha256 })
  }
  const copiedDatabase = evidence.find((item) => item.sourcePath === databasePath)
  if (!copiedDatabase) throw new Error('源数据库不存在或不是普通文件')
  sqlite(copiedDatabase.copiedPath, (resolvedPath) => [resolvedPath, '.timeout 30000', `.backup '${partialPath.replaceAll("'", "''")}'`])
  return evidence
}

async function assertEvidenceUnchanged(evidence) {
  for (const item of evidence) {
    const metadata = await stat(item.sourcePath).catch(() => null)
    if (!metadata?.isFile() || metadata.size !== item.bytes || await sha256File(item.sourcePath) !== item.sha256) {
      throw new Error(`候选生成期间源证据发生变化：${item.sourcePath}`)
    }
  }
}

function archiveRemovedSchema(databasePath, audit) {
  const redefinedTables = new Set(audit.prismaDiff.redefinedTables)
  const dropOnlyTables = audit.prismaDiff.dropTables.filter((tableName) => !redefinedTables.has(tableName))
  const tableArchives = dropOnlyTables.map((tableName) => ({
    name: tableName,
    schemaSql: sqliteJson(databasePath, `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${tableName.replaceAll("'", "''")}';`)[0]?.sql || null,
    rows: sqliteJson(databasePath, `SELECT * FROM ${quoteIdentifier(tableName)};`),
  }))
  const changedTableArchives = audit.comparison.changedObjects
    .filter((item) => item.type === 'table' && item.extraColumns?.length > 0)
    .map((item) => ({
      name: item.name,
      extraColumns: item.extraColumns,
      rows: sqliteJson(
        databasePath,
        `SELECT ${['id', ...item.extraColumns].map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(item.name)};`,
      ),
    }))
  return { tableArchives, changedTableArchives }
}

function databaseChecks(databasePath) {
  const quickCheck = sqliteJson(databasePath, 'PRAGMA quick_check;').map((row) => Object.values(row)[0])
  const integrityCheck = sqliteJson(databasePath, 'PRAGMA integrity_check;').map((row) => Object.values(row)[0])
  const foreignKeyCheck = sqliteJson(databasePath, 'PRAGMA foreign_key_check;')
  if (quickCheck[0] !== 'ok' || integrityCheck[0] !== 'ok' || foreignKeyCheck.length > 0) {
    throw new Error('重建候选未通过 SQLite 完整性或外键检查')
  }
  return { quickCheck, integrityCheck, foreignKeyCheck }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const databasePath = path.resolve(options.database)
  const auditPath = path.resolve(options.audit)
  const targetPath = path.resolve(options.target)
  const partialPath = `${targetPath}.partial`
  const archivePath = path.resolve(options.archive)
  const reportPath = path.resolve(options.report)
  for (const outputPath of [targetPath, partialPath, archivePath, reportPath]) {
    if (await stat(outputPath).catch(() => null)) throw new Error(`输出已存在，拒绝覆盖：${outputPath}`)
  }
  const auditSource = await readFile(auditPath, 'utf8')
  const audit = JSON.parse(auditSource)
  if (audit.format !== 'mes-lite-production-schema-drift-audit' || audit.formatVersion !== 1) throw new Error('Schema 漂移审计报告格式无效')
  if (!audit.hasDrift || !audit.prismaDiff?.script?.trim()) throw new Error('审计报告没有可重建的 Schema 漂移')
  if (path.resolve(audit.source.databasePath) !== databasePath) throw new Error('审计报告与源数据库路径不匹配')
  const sourceEvidence = audit.source.evidenceFiles.find((item) => path.resolve(item.sourcePath) === databasePath)
  if (!sourceEvidence || await sha256File(databasePath) !== sourceEvidence.sha256) throw new Error('源数据库与审计报告哈希不一致，必须重新审计')
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], { cwd: process.cwd(), encoding: 'utf8' }).trim()
  if (currentCommit !== audit.expected.commit) throw new Error('当前代码提交与审计目标提交不一致，必须重新审计')

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-schema-reconciliation-'))
  let evidence = []
  try {
    await mkdir(path.dirname(targetPath), { recursive: true })
    await mkdir(path.dirname(archivePath), { recursive: true })
    await mkdir(path.dirname(reportPath), { recursive: true })
    evidence = await createStableCandidateSnapshot(databasePath, temporaryRoot, partialPath)
    const archive = {
      format: 'mes-lite-retired-schema-data-archive',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      operator: options.operator,
      sourceDatabaseSha256: sourceEvidence.sha256,
      auditPath,
      auditSha256: createHash('sha256').update(auditSource).digest('hex'),
      expected: audit.expected,
      ...archiveRemovedSchema(partialPath, audit),
    }
    await writeFile(archivePath, `${JSON.stringify(archive, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    const archiveSha256 = await sha256File(archivePath)

    sqlite(partialPath, (resolvedPath) => [resolvedPath], `${audit.prismaDiff.script}\n`)
    const checks = databaseChecks(partialPath)
    const postAuditPath = path.join(temporaryRoot, 'post-reconciliation-audit.json')
    const postAudit = spawnSync(process.execPath, [
      'scripts/audit-production-schema-drift.mjs',
      '--database', partialPath,
      '--report', postAuditPath,
      '--expected-ref', audit.expected.commit,
    ], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (postAudit.status !== 0) throw new Error(`重建后 Schema 仍有漂移：${postAudit.stderr.trim() || postAudit.stdout.trim()}`)
    const postAuditReport = JSON.parse(await readFile(postAuditPath, 'utf8'))
    if (postAuditReport.classification !== 'NO_SCHEMA_DRIFT') throw new Error('重建后 Schema 审计未通过')
    await assertEvidenceUnchanged(evidence)
    const targetSha256 = await sha256File(partialPath)
    await rename(partialPath, targetPath)
    const report = {
      format: 'mes-lite-production-schema-reconciliation-candidate',
      formatVersion: 1,
      status: 'CANDIDATE_COMPLETE',
      createdAt: new Date().toISOString(),
      operator: options.operator,
      source: {
        databasePath,
        sha256: sourceEvidence.sha256,
        unchanged: true,
      },
      expected: audit.expected,
      inputAudit: { path: auditPath, sha256: archive.auditSha256, classification: audit.classification },
      archive: {
        path: archivePath,
        sha256: archiveSha256,
        tableRowCounts: archive.tableArchives.map((item) => ({ name: item.name, rowCount: item.rows.length })),
        changedTableExtraColumns: archive.changedTableArchives.map((item) => ({ name: item.name, columns: item.extraColumns, rowCount: item.rows.length })),
      },
      candidate: { path: targetPath, sha256: targetSha256, checks },
      postAudit: {
        classification: postAuditReport.classification,
        expectedCommit: postAuditReport.expected.commit,
        sourceUnchanged: postAuditReport.source.unchangedAfterAudit,
      },
      rollback: {
        method: '丢弃候选即可回滚；源数据库从未修改。生产切换前仍须创建数据库与附件一致备份。',
        sourcePreserved: true,
      },
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    console.log(JSON.stringify({
      status: report.status,
      targetPath,
      targetSha256,
      archivePath,
      archiveSha256,
      archivedTables: report.archive.tableRowCounts.length,
      archivedRows: report.archive.tableRowCounts.reduce((total, item) => total + item.rowCount, 0),
      postAudit: report.postAudit.classification,
      sourceUnchanged: true,
    }))
  } finally {
    await rm(partialPath, { force: true })
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`生产 Schema 重建候选失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
