import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sqlite(databasePath, sql) {
  execFileSync('sqlite3', [databasePath, sql], { encoding: 'utf8' })
}

function sqliteTableExists(databasePath, tableName) {
  return execFileSync('sqlite3', ['-readonly', databasePath, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '${tableName}';`], { encoding: 'utf8' }).trim() === '1'
}

function sqliteColumnExists(databasePath, tableName, columnName) {
  return execFileSync('sqlite3', ['-readonly', databasePath, `SELECT COUNT(*) FROM pragma_table_info('${tableName}') WHERE name = '${columnName}';`], { encoding: 'utf8' }).trim() === '1'
}

function runAudit(databasePath, reportPath) {
  return spawnSync(process.execPath, [
    'scripts/audit-production-schema-drift.mjs',
    '--database', databasePath,
    '--report', reportPath,
    '--expected-ref', 'HEAD',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

function runReconciliation(databasePath, auditPath, targetPath, archivePath, reportPath) {
  return spawnSync(process.execPath, [
    'scripts/prepare-production-schema-reconciliation-candidate.mjs',
    '--database', databasePath,
    '--audit', auditPath,
    '--target', targetPath,
    '--archive', archivePath,
    '--report', reportPath,
    '--operator', 'schema-drift-verifier',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-production-schema-audit-verify-'))
  try {
    const cleanDatabasePath = path.join(temporaryRoot, 'clean.db')
    sqlite(cleanDatabasePath, 'VACUUM;')
    const deploy = spawnSync(path.join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: `file:${cleanDatabasePath}` },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    assert.equal(deploy.status, 0, deploy.stderr || deploy.stdout)

    const cleanBefore = await readFile(cleanDatabasePath)
    const cleanReportPath = path.join(temporaryRoot, 'clean-report.json')
    const cleanResult = runAudit(cleanDatabasePath, cleanReportPath)
    assert.equal(cleanResult.status, 0, cleanResult.stderr || cleanResult.stdout)
    const cleanReport = JSON.parse(await readFile(cleanReportPath, 'utf8'))
    assert.equal(cleanReport.classification, 'NO_SCHEMA_DRIFT')
    assert.equal(cleanReport.hasDrift, false)
    assert.equal(cleanReport.comparison.extraObjects.length, 0)
    assert.equal(cleanReport.comparison.missingObjects.length, 0)
    assert.equal(cleanReport.comparison.changedObjects.length, 0)
    assert.equal(cleanReport.source.unchangedAfterAudit, true)
    assert.equal(sha256(await readFile(cleanDatabasePath)), sha256(cleanBefore), '清洁数据库不得被审计改写')

    const driftDatabasePath = path.join(temporaryRoot, 'drift.db')
    await copyFile(cleanDatabasePath, driftDatabasePath)
    sqlite(driftDatabasePath, `
      ALTER TABLE "MaterialIn" ADD COLUMN "legacyRequestId" TEXT;
      CREATE TABLE "LegacyRemovedBranch" ("id" TEXT NOT NULL PRIMARY KEY, "note" TEXT);
      CREATE INDEX "LegacyRemovedBranch_note_idx" ON "LegacyRemovedBranch"("note");
      INSERT INTO "LegacyRemovedBranch" ("id", "note") VALUES ('legacy-1', 'must archive before cleanup');
    `)
    const driftBefore = await readFile(driftDatabasePath)
    const driftReportPath = path.join(temporaryRoot, 'drift-report.json')
    const driftResult = runAudit(driftDatabasePath, driftReportPath)
    assert.equal(driftResult.status, 2, driftResult.stderr || driftResult.stdout)
    const driftReport = JSON.parse(await readFile(driftReportPath, 'utf8'))
    assert.equal(driftReport.classification, 'DATA_BEARING_REMOVED_SCHEMA')
    assert.equal(driftReport.recommendation, 'STOP_ARCHIVE_AND_APPROVE_DATA_DISPOSITION')
    assert.deepEqual(driftReport.comparison.extraTables, [{ name: 'LegacyRemovedBranch', rowCount: 1 }])
    assert.ok(driftReport.comparison.changedObjects.some((item) => item.name === 'MaterialIn' && item.extraColumns.includes('legacyRequestId')))
    assert.ok(driftReport.prismaDiff.dropTables.includes('LegacyRemovedBranch'))
    assert.ok(driftReport.prismaDiff.dropIndexes.includes('LegacyRemovedBranch_note_idx'))
    assert.ok(driftReport.prismaDiff.redefinedTables.includes('MaterialIn'))
    assert.equal(sha256(await readFile(driftDatabasePath)), sha256(driftBefore), '漂移数据库不得被审计改写')

    const candidatePath = path.join(temporaryRoot, 'reconciled-candidate.db')
    const archivePath = path.join(temporaryRoot, 'retired-schema-archive.json')
    const reconciliationReportPath = path.join(temporaryRoot, 'reconciliation-report.json')
    const reconciliation = runReconciliation(
      driftDatabasePath,
      driftReportPath,
      candidatePath,
      archivePath,
      reconciliationReportPath,
    )
    assert.equal(reconciliation.status, 0, reconciliation.stderr || reconciliation.stdout)
    const reconciliationReport = JSON.parse(await readFile(reconciliationReportPath, 'utf8'))
    const retiredArchive = JSON.parse(await readFile(archivePath, 'utf8'))
    assert.equal(reconciliationReport.status, 'CANDIDATE_COMPLETE')
    assert.equal(reconciliationReport.source.unchanged, true)
    assert.equal(reconciliationReport.postAudit.classification, 'NO_SCHEMA_DRIFT')
    assert.equal(reconciliationReport.rollback.sourcePreserved, true)
    assert.deepEqual(retiredArchive.tableArchives.find((item) => item.name === 'LegacyRemovedBranch').rows, [
      { id: 'legacy-1', note: 'must archive before cleanup' },
    ])
    assert.equal(sqliteColumnExists(candidatePath, 'MaterialIn', 'legacyRequestId'), false)
    assert.equal(sqliteTableExists(candidatePath, 'LegacyRemovedBranch'), false)
    assert.equal(sha256(await readFile(driftDatabasePath)), sha256(driftBefore), '生成重建候选不得改写源数据库')

    const overwriteResult = runAudit(driftDatabasePath, driftReportPath)
    assert.equal(overwriteResult.status, 1)
    assert.match(overwriteResult.stderr, /不允许覆盖/)
    console.log('生产 Schema 漂移审计验证通过：迁移基线、额外/缺失/变更对象、带数据旧表、不可覆盖报告和源库只读约束符合预期。')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
