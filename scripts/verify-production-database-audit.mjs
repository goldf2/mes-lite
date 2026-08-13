import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const migrationName = '20260812223000_add_material_projections_for_product_exit'

function sqlite(databasePath, sql) {
  execFileSync('sqlite3', [databasePath, sql], { encoding: 'utf8' })
}

function audit(databasePath, reportPath) {
  return JSON.parse(execFileSync(process.execPath, [
    'scripts/audit-production-database.mjs', '--database', databasePath,
    '--report', reportPath, '--expected-ref', 'be7e18f',
  ], { cwd: root, encoding: 'utf8' }))
}

function fileSha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-production-audit-verify-'))
  try {
    const migrationSql = execFileSync('git', ['show', `be7e18f:prisma/migrations/${migrationName}/migration.sql`], {
      cwd: root,
      encoding: 'buffer',
    })
    const checksum = fileSha256(migrationSql)
    const databasePath = path.join(temporaryRoot, 'production-copy.db')
    sqlite(databasePath, `
      CREATE TABLE "_prisma_migrations" (
        id TEXT PRIMARY KEY, checksum TEXT NOT NULL, finished_at TEXT, migration_name TEXT NOT NULL,
        logs TEXT, rolled_back_at TEXT, started_at TEXT NOT NULL, applied_steps_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO "_prisma_migrations" VALUES (
        'failed-id', '${checksum}', NULL, '${migrationName}', 'simulated production failure', NULL,
        '2026-08-12 15:33:10.448 UTC', 0
      );
      CREATE TABLE "Product" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "BOM" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "BomCostRun" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "ProcessRoute" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "SawingCostScenario" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "StockIn" (id TEXT PRIMARY KEY, createdAt TEXT);
    `)
    const original = await readFile(databasePath)
    const emptyReportPath = path.join(temporaryRoot, 'empty.json')
    const emptyResult = audit(databasePath, emptyReportPath)
    assert.equal(emptyResult.classification, 'STRUCTURE_NOT_APPLIED_STATUS_FAILED')
    assert.equal(emptyResult.recommendation, 'BACKUP_THEN_RESOLVE_ROLLED_BACK_THEN_MIGRATE_DEPLOY')
    assert.deepEqual(await readFile(databasePath), original, '审计不得修改源数据库')

    sqlite(databasePath, 'ALTER TABLE "Product" ADD COLUMN "materialId" TEXT; CREATE UNIQUE INDEX "Product_materialId_key" ON "Product"("materialId");')
    const partialResult = audit(databasePath, path.join(temporaryRoot, 'partial.json'))
    assert.equal(partialResult.classification, 'STRUCTURE_PARTIALLY_APPLIED_STATUS_FAILED')
    assert.equal(partialResult.recommendation, 'BACKUP_THEN_REPAIR_MISSING_STRUCTURES_THEN_RESOLVE_APPLIED_THEN_MIGRATE_DEPLOY')

    sqlite(databasePath, `
      ALTER TABLE "BOM" ADD COLUMN "materialId" TEXT;
      ALTER TABLE "BomCostRun" ADD COLUMN "materialId" TEXT;
      ALTER TABLE "ProcessRoute" ADD COLUMN "materialId" TEXT;
      ALTER TABLE "SawingCostScenario" ADD COLUMN "materialId" TEXT;
      ALTER TABLE "StockIn" ADD COLUMN "materialId" TEXT;
      CREATE INDEX "BOM_materialId_idx" ON "BOM"("materialId");
      CREATE INDEX "BomCostRun_materialId_createdAt_idx" ON "BomCostRun"("materialId", "createdAt");
      CREATE INDEX "ProcessRoute_materialId_idx" ON "ProcessRoute"("materialId");
      CREATE INDEX "SawingCostScenario_materialId_idx" ON "SawingCostScenario"("materialId");
      CREATE INDEX "StockIn_materialId_idx" ON "StockIn"("materialId");
    `)
    const completeResult = audit(databasePath, path.join(temporaryRoot, 'complete.json'))
    assert.equal(completeResult.classification, 'STRUCTURE_COMPLETE_STATUS_FAILED')
    assert.equal(completeResult.recommendation, 'BACKUP_THEN_RESOLVE_APPLIED_THEN_MIGRATE_DEPLOY')
    const report = JSON.parse(await readFile(path.join(temporaryRoot, 'complete.json'), 'utf8'))
    assert.equal(report.snapshot.quickCheck[0], 'ok')
    assert.equal(report.snapshot.integrityCheck[0], 'ok')
    assert.deepEqual(report.snapshot.foreignKeyCheck, [])
    assert.equal(report.knownMigration.checksumMatches, true)
    assert.equal(report.knownMigration.columns.every((item) => item.matches), true)
    assert.equal(report.knownMigration.indexes.every((item) => item.matches), true)
    assert.equal(report.source.sourceFilesNeverOpenedBySqlite, true)

    const mismatchDatabasePath = path.join(temporaryRoot, 'mismatch.db')
    sqlite(mismatchDatabasePath, `
      CREATE TABLE "_prisma_migrations" (
        id TEXT PRIMARY KEY, checksum TEXT NOT NULL, finished_at TEXT, migration_name TEXT NOT NULL,
        logs TEXT, rolled_back_at TEXT, started_at TEXT NOT NULL, applied_steps_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO "_prisma_migrations" VALUES (
        'failed-id', '${checksum}', NULL, '${migrationName}', 'simulated mismatch', NULL,
        '2026-08-12 15:33:10.448 UTC', 0
      );
      CREATE TABLE "Product" (id TEXT PRIMARY KEY, materialId INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE "BOM" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "BomCostRun" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "ProcessRoute" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "SawingCostScenario" (id TEXT PRIMARY KEY, createdAt TEXT);
      CREATE TABLE "StockIn" (id TEXT PRIMARY KEY, createdAt TEXT);
    `)
    const mismatchResult = audit(mismatchDatabasePath, path.join(temporaryRoot, 'mismatch.json'))
    assert.equal(mismatchResult.classification, 'STRUCTURE_PARTIALLY_APPLIED_STATUS_FAILED')
    assert.equal(mismatchResult.recommendation, 'STOP_EXISTING_STRUCTURE_MISMATCH')

    sqlite(databasePath, `
      INSERT INTO "_prisma_migrations" VALUES (
        'unexpected-id', 'unexpected-checksum', '2026-08-12 16:00:00 UTC',
        '20260730020000_removed_feature_branch', NULL, NULL,
        '2026-08-12 16:00:00 UTC', 1
      );
    `)
    const unexpectedReportPath = path.join(temporaryRoot, 'unexpected.json')
    const unexpectedResult = audit(databasePath, unexpectedReportPath)
    const unexpectedReport = JSON.parse(await readFile(unexpectedReportPath, 'utf8'))
    assert.deepEqual(unexpectedReport.migrationState.unexpectedApplied, ['20260730020000_removed_feature_branch'])
    assert.equal(unexpectedResult.recommendation, 'STOP_UNEXPECTED_APPLIED_MIGRATIONS_REQUIRE_DRIFT_AUDIT')
    console.log('生产数据库只读审计验证通过：未执行、部分执行、结构完成三种失败状态均可区分，源文件保持不变。')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
