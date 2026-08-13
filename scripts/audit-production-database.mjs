import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const targetMigration = '20260812223000_add_material_projections_for_product_exit'
const expectedColumns = [
  ['Product', 'materialId'],
  ['BOM', 'materialId'],
  ['BomCostRun', 'materialId'],
  ['ProcessRoute', 'materialId'],
  ['SawingCostScenario', 'materialId'],
  ['StockIn', 'materialId'],
]
const expectedIndexes = [
  ['Product_materialId_key', 'Product', ['materialId'], true],
  ['BOM_materialId_idx', 'BOM', ['materialId'], false],
  ['BomCostRun_materialId_createdAt_idx', 'BomCostRun', ['materialId', 'createdAt'], false],
  ['ProcessRoute_materialId_idx', 'ProcessRoute', ['materialId'], false],
  ['SawingCostScenario_materialId_idx', 'SawingCostScenario', ['materialId'], false],
  ['StockIn_materialId_idx', 'StockIn', ['materialId'], false],
]

function parseArgs(values) {
  const options = {}
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`参数无效：${key || ''}`)
    options[key.slice(2)] = value
    index += 1
  }
  if (!options.database || !options.report) {
    throw new Error('用法：audit-production-database --database <mes_lite.db> --report <不存在的.json> [--expected-ref <git-ref>]')
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

function git(args) {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
}

function gitBuffer(args) {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'buffer' })
}

function sqliteJson(databasePath, sql) {
  const result = spawnSync('sqlite3', ['-readonly', '-json', databasePath, sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`SQLite 只读查询失败：${result.stderr.trim() || result.stdout.trim()}`)
  return result.stdout.trim() ? JSON.parse(result.stdout) : []
}

function sqliteText(databasePath, sql) {
  const result = spawnSync('sqlite3', ['-readonly', '-noheader', databasePath, sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`SQLite 只读检查失败：${result.stderr.trim() || result.stdout.trim()}`)
  return result.stdout.trim().split('\n').filter(Boolean)
}

function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function stableCopyEvidence(databasePath, temporaryRoot) {
  const candidates = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
  const copied = []
  for (const sourcePath of candidates) {
    const sourceStat = await stat(sourcePath).catch(() => null)
    if (!sourceStat?.isFile()) continue
    const hashBefore = await sha256File(sourcePath)
    const targetPath = path.join(temporaryRoot, path.basename(sourcePath))
    await copyFile(sourcePath, targetPath)
    const hashAfter = await sha256File(sourcePath)
    if (hashBefore !== hashAfter) throw new Error(`证据文件复制期间发生变化，请停止应用后重新复制：${sourcePath}`)
    copied.push({ sourcePath, targetPath, bytes: sourceStat.size, sha256: hashBefore })
  }
  if (!copied.some((item) => item.sourcePath === databasePath)) throw new Error('数据库文件不存在或不是普通文件')
  return copied
}

function createConsistentSnapshot(copiedDatabasePath, snapshotPath) {
  const result = spawnSync('sqlite3', [copiedDatabasePath, `.timeout 30000`, `.backup ${quoteSqlString(snapshotPath)}`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`创建审计快照失败：${result.stderr.trim() || result.stdout.trim()}`)
}

function expectedRepositoryState(expectedRef) {
  const commit = git(['rev-parse', `${expectedRef}^{commit}`])
  const packageJson = JSON.parse(git(['show', `${commit}:package.json`]))
  const migrationEntries = git(['ls-tree', '--name-only', `${commit}:prisma/migrations`]).split('\n').filter((name) => /^\d{14}_.+/.test(name))
  const migrationChecksums = Object.fromEntries(migrationEntries.map((name) => {
    const migrationSql = gitBuffer(['show', `${commit}:prisma/migrations/${name}/migration.sql`])
    return [name, createHash('sha256').update(migrationSql).digest('hex')]
  }))
  return {
    requestedRef: expectedRef,
    commit,
    version: packageJson.version,
    expectedMigrationCount: migrationEntries.length,
    expectedMigrationNames: migrationEntries,
    targetMigrationChecksum: migrationChecksums[targetMigration],
    migrationChecksums,
  }
}

function inspectKnownMigration(databasePath, migrationRows, expectedChecksum) {
  const columnResults = expectedColumns.map(([table, column]) => {
    const rows = sqliteJson(databasePath, `PRAGMA table_info(${quoteIdentifier(table)});`)
    const row = rows.find((item) => item.name === column)
    return {
      table,
      column,
      expectedType: 'TEXT',
      expectedNullable: true,
      expectedDefaultValue: null,
      exists: Boolean(row),
      actualType: row?.type || null,
      actualNullable: row ? !Boolean(row.notnull) : null,
      actualDefaultValue: row?.dflt_value ?? null,
      matches: Boolean(row)
        && String(row.type || '').toUpperCase() === 'TEXT'
        && !Boolean(row.notnull)
        && row.dflt_value === null,
    }
  })
  const indexResults = expectedIndexes.map(([name, table, columns, unique]) => {
    const rows = sqliteJson(databasePath, `PRAGMA index_list(${quoteIdentifier(table)});`)
    const row = rows.find((item) => item.name === name)
    const actualColumns = row ? sqliteJson(databasePath, `PRAGMA index_info(${quoteIdentifier(name)});`).map((item) => item.name) : []
    return {
      name,
      table,
      expectedColumns: columns,
      expectedUnique: unique,
      exists: Boolean(row),
      actualColumns,
      actualUnique: row ? Boolean(row.unique) : null,
      matches: Boolean(row) && Boolean(row.unique) === unique && JSON.stringify(actualColumns) === JSON.stringify(columns),
    }
  })
  const failedRows = migrationRows.filter((row) => row.migration_name === targetMigration && !row.finished_at && !row.rolled_back_at)
  const allStructuresPresent = columnResults.every((item) => item.matches) && indexResults.every((item) => item.matches)
  const noStructuresPresent = columnResults.every((item) => !item.exists) && indexResults.every((item) => !item.exists)
  const existingStructureMismatch = columnResults.some((item) => item.exists && !item.matches)
    || indexResults.some((item) => item.exists && !item.matches)
  const classification = failedRows.length === 0
    ? 'TARGET_MIGRATION_NOT_ACTIVE_FAILED'
    : allStructuresPresent
      ? 'STRUCTURE_COMPLETE_STATUS_FAILED'
      : noStructuresPresent
        ? 'STRUCTURE_NOT_APPLIED_STATUS_FAILED'
        : 'STRUCTURE_PARTIALLY_APPLIED_STATUS_FAILED'
  return {
    migrationName: targetMigration,
    classification,
    failedRows,
    checksumMatches: failedRows.length === 1 ? failedRows[0].checksum === expectedChecksum : null,
    existingStructureMismatch,
    columns: columnResults,
    indexes: indexResults,
  }
}

function recommendedAction(knownMigration, migrationState) {
  if (migrationState.otherActiveFailures.length > 0) {
    return 'STOP_OTHER_FAILED_MIGRATIONS_REQUIRE_SEPARATE_AUDIT'
  }
  if (migrationState.expectedChecksumMismatches.length > 0) {
    return 'STOP_EXPECTED_MIGRATION_CHECKSUM_MISMATCH'
  }
  if (migrationState.unexpectedApplied.length > 0) {
    return 'STOP_UNEXPECTED_APPLIED_MIGRATIONS_REQUIRE_DRIFT_AUDIT'
  }
  if (knownMigration.checksumMatches === false) return 'STOP_TARGET_MIGRATION_CHECKSUM_MISMATCH'
  if (knownMigration.existingStructureMismatch) return 'STOP_EXISTING_STRUCTURE_MISMATCH'
  if (knownMigration.classification === 'STRUCTURE_COMPLETE_STATUS_FAILED') {
    return 'BACKUP_THEN_RESOLVE_APPLIED_THEN_MIGRATE_DEPLOY'
  }
  if (knownMigration.classification === 'STRUCTURE_NOT_APPLIED_STATUS_FAILED') {
    return 'BACKUP_THEN_RESOLVE_ROLLED_BACK_THEN_MIGRATE_DEPLOY'
  }
  if (knownMigration.classification === 'STRUCTURE_PARTIALLY_APPLIED_STATUS_FAILED') {
    return 'BACKUP_THEN_REPAIR_MISSING_STRUCTURES_THEN_RESOLVE_APPLIED_THEN_MIGRATE_DEPLOY'
  }
  return 'NO_AUTOMATIC_RECOVERY_RECOMMENDATION'
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const databasePath = path.resolve(options.database)
  const reportPath = path.resolve(options.report)
  if (await stat(reportPath).catch(() => null)) throw new Error('审计报告必须写入不存在的新文件，不允许覆盖')
  const expected = expectedRepositoryState(options['expected-ref'] || 'be7e18f')
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-production-audit-'))
  try {
    const evidence = await stableCopyEvidence(databasePath, temporaryRoot)
    const copiedDatabasePath = evidence.find((item) => item.sourcePath === databasePath).targetPath
    const snapshotPath = path.join(temporaryRoot, 'consistent-audit-snapshot.db')
    createConsistentSnapshot(copiedDatabasePath, snapshotPath)
    const quickCheck = sqliteText(snapshotPath, 'PRAGMA quick_check;')
    const integrityCheck = sqliteText(snapshotPath, 'PRAGMA integrity_check;')
    const foreignKeyCheck = sqliteJson(snapshotPath, 'PRAGMA foreign_key_check;')
    const migrationTableExists = sqliteJson(
      snapshotPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';",
    ).length === 1
    if (!migrationTableExists) throw new Error('数据库缺少 _prisma_migrations，无法按生产库审计')
    const migrationRows = sqliteJson(snapshotPath, `
      SELECT id, checksum, started_at, finished_at, rolled_back_at, applied_steps_count, migration_name, logs
      FROM "_prisma_migrations"
      ORDER BY started_at ASC;
    `)
    const activeFailures = migrationRows.filter((row) => !row.finished_at && !row.rolled_back_at)
    const appliedNames = new Set(migrationRows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name))
    const expectedNames = new Set(expected.expectedMigrationNames)
    const expectedChecksumMismatches = migrationRows
      .filter((row) => !row.rolled_back_at && expectedNames.has(row.migration_name))
      .filter((row) => row.checksum !== expected.migrationChecksums[row.migration_name])
      .map((row) => ({
        id: row.id,
        migrationName: row.migration_name,
        actualChecksum: row.checksum,
        expectedChecksum: expected.migrationChecksums[row.migration_name],
      }))
    const migrationState = {
      totalRows: migrationRows.length,
      appliedCount: appliedNames.size,
      activeFailures,
      otherActiveFailures: activeFailures.filter((row) => row.migration_name !== targetMigration),
      pendingExpected: expected.expectedMigrationNames.filter((name) => !appliedNames.has(name)),
      unexpectedApplied: [...appliedNames].filter((name) => !expectedNames.has(name)),
      expectedChecksumMismatches,
    }
    const knownMigration = inspectKnownMigration(snapshotPath, migrationRows, expected.targetMigrationChecksum)
    const report = {
      format: 'mes-lite-production-database-audit',
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      source: {
        databasePath,
        evidenceFiles: evidence.map(({ sourcePath, bytes, sha256 }) => ({ sourcePath, bytes, sha256 })),
        sourceFilesNeverOpenedBySqlite: true,
      },
      snapshot: {
        sha256: await sha256File(snapshotPath),
        quickCheck,
        integrityCheck,
        foreignKeyCheck,
      },
      expected,
      migrationState,
      knownMigration,
      recommendation: recommendedAction(knownMigration, migrationState),
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    console.log(JSON.stringify({
      reportPath,
      quickCheck: quickCheck.join(', '),
      integrityCheck: integrityCheck.join(', '),
      activeFailures: activeFailures.map((row) => row.migration_name),
      classification: knownMigration.classification,
      recommendation: report.recommendation,
    }))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`生产数据库审计失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
