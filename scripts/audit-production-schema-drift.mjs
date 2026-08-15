import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
  if (!options.database || !options.report) {
    throw new Error('用法：audit-production-schema-drift --database <mes_lite.db> --report <不存在的.json> [--expected-ref <git-ref>]')
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

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex')
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, { cwd: process.cwd(), encoding }).toString().trim()
}

function sqlite(databasePath, args) {
  const result = spawnSync('sqlite3', args(databasePath), {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
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

async function stableCopyEvidence(databasePath, temporaryRoot) {
  const candidates = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
  const copied = []
  for (const sourcePath of candidates) {
    const sourceStat = await stat(sourcePath).catch(() => null)
    if (!sourceStat?.isFile()) continue
    const sha256 = await sha256File(sourcePath)
    const targetPath = path.join(temporaryRoot, path.basename(sourcePath))
    await copyFile(sourcePath, targetPath)
    const copiedSha256 = await sha256File(targetPath)
    const sourceSha256AfterCopy = await sha256File(sourcePath)
    if (sha256 !== copiedSha256 || sha256 !== sourceSha256AfterCopy) {
      throw new Error(`证据文件复制期间发生变化，请停止写入后重新复制：${sourcePath}`)
    }
    copied.push({ sourcePath, targetPath, bytes: sourceStat.size, sha256 })
  }
  if (!copied.some((item) => item.sourcePath === databasePath)) throw new Error('数据库文件不存在或不是普通文件')
  return copied
}

async function assertSourceEvidenceUnchanged(evidence) {
  for (const item of evidence) {
    const metadata = await stat(item.sourcePath).catch(() => null)
    if (!metadata?.isFile() || metadata.size !== item.bytes || await sha256File(item.sourcePath) !== item.sha256) {
      throw new Error(`审计期间源证据发生变化，报告已废弃：${item.sourcePath}`)
    }
  }
}

function createConsistentSnapshot(copiedDatabasePath, snapshotPath) {
  sqlite(copiedDatabasePath, (resolvedPath) => [resolvedPath, '.timeout 30000', `.backup '${snapshotPath.replaceAll("'", "''")}'`])
}

async function buildExpectedMigrationDatabase(expectedRef, temporaryRoot) {
  const commit = git(['rev-parse', `${expectedRef}^{commit}`])
  const packageJson = JSON.parse(git(['show', `${commit}:package.json`]))
  const expectedRoot = path.join(temporaryRoot, 'expected-release')
  const prismaRoot = path.join(expectedRoot, 'prisma')
  const migrationsRoot = path.join(prismaRoot, 'migrations')
  await mkdir(migrationsRoot, { recursive: true })
  await writeFile(path.join(prismaRoot, 'schema.prisma'), execFileSync('git', ['show', `${commit}:prisma/schema.prisma`], { cwd: process.cwd() }))
  const migrationNames = git(['ls-tree', '--name-only', `${commit}:prisma/migrations`])
    .split('\n')
    .filter((name) => /^\d{14}_.+/.test(name))
  for (const migrationName of migrationNames) {
    const migrationDirectory = path.join(migrationsRoot, migrationName)
    await mkdir(migrationDirectory, { recursive: true })
    await writeFile(
      path.join(migrationDirectory, 'migration.sql'),
      execFileSync('git', ['show', `${commit}:prisma/migrations/${migrationName}/migration.sql`], { cwd: process.cwd() }),
    )
  }

  const baselinePath = path.join(temporaryRoot, 'expected-migration-baseline.db')
  sqlite(baselinePath, (resolvedPath) => [resolvedPath, 'VACUUM;'])
  const prismaPath = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
  const deploy = spawnSync(prismaPath, ['migrate', 'deploy', '--schema', path.join(prismaRoot, 'schema.prisma')], {
    cwd: expectedRoot,
    env: { ...process.env, DATABASE_URL: `file:${baselinePath}` },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (deploy.status !== 0) throw new Error(`建立目标迁移基线失败：${deploy.stderr.trim() || deploy.stdout.trim()}`)
  return { requestedRef: expectedRef, commit, version: packageJson.version, migrationCount: migrationNames.length, baselinePath }
}

function normalizeSql(value) {
  return String(value || '').replaceAll(/\s+/g, ' ').trim()
}

function schemaObjects(databasePath) {
  return sqliteJson(databasePath, `
    SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
      AND name <> '_prisma_migrations'
    ORDER BY type, name;
  `).map((item) => ({ ...item, normalizedSql: normalizeSql(item.sql) }))
}

function tableColumns(databasePath, tableName) {
  return sqliteJson(databasePath, `PRAGMA table_info(${quoteIdentifier(tableName)});`).map((item) => item.name)
}

function compareSchemaObjects(actualPath, expectedPath) {
  const actual = schemaObjects(actualPath)
  const expected = schemaObjects(expectedPath)
  const key = (item) => `${item.type}:${item.name}`
  const actualByKey = new Map(actual.map((item) => [key(item), item]))
  const expectedByKey = new Map(expected.map((item) => [key(item), item]))
  const extraObjects = actual.filter((item) => !expectedByKey.has(key(item)))
  const missingObjects = expected.filter((item) => !actualByKey.has(key(item)))
  const rawChangedObjects = actual.flatMap((item) => {
    const expectedItem = expectedByKey.get(key(item))
    if (!expectedItem || item.normalizedSql === expectedItem.normalizedSql) return []
    const detail = { type: item.type, name: item.name, tableName: item.tableName }
    if (item.type !== 'table') return [detail]
    const actualColumns = tableColumns(actualPath, item.name)
    const expectedColumns = tableColumns(expectedPath, item.name)
    return [{
      ...detail,
      extraColumns: actualColumns.filter((name) => !expectedColumns.includes(name)),
      missingColumns: expectedColumns.filter((name) => !actualColumns.includes(name)),
    }]
  })
  const extraTables = extraObjects.filter((item) => item.type === 'table').map((item) => ({
    name: item.name,
    rowCount: Number(sqliteJson(actualPath, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(item.name)};`)[0]?.count || 0),
  }))
  return {
    actualObjectCount: actual.length,
    expectedObjectCount: expected.length,
    extraObjects: extraObjects.map(({ type, name, tableName }) => ({ type, name, tableName })),
    missingObjects: missingObjects.map(({ type, name, tableName }) => ({ type, name, tableName })),
    rawChangedObjects,
    extraTables,
  }
}

function prismaDiff(actualPath, expectedPath) {
  const prismaPath = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
  const result = spawnSync(prismaPath, [
    'migrate', 'diff', '--from-url', `file:${actualPath}`, '--to-url', `file:${expectedPath}`, '--script',
  ], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`生成 Schema 漂移 SQL 失败：${result.stderr.trim() || result.stdout.trim()}`)
  const script = result.stdout.trim()
  const matches = (expression) => Array.from(script.matchAll(expression), (match) => match[1])
  return {
    sha256: sha256Text(script),
    lineCount: script ? script.split('\n').length : 0,
    dropTables: Array.from(new Set(matches(/^DROP TABLE "([^"]+)";/gm))),
    dropIndexes: Array.from(new Set(matches(/^DROP INDEX "([^"]+)";/gm))),
    redefinedTables: Array.from(new Set(matches(/^CREATE TABLE "new_([^"]+)" \(/gm))),
    alteredTables: Array.from(new Set(matches(/^ALTER TABLE "([^"]+)" (?!RENAME TO)/gm))),
    createdIndexes: Array.from(new Set(matches(/^CREATE (?:UNIQUE )?INDEX "([^"]+)" /gm))),
    isEmpty: script === '-- This is an empty migration.' || script === '',
    script,
  }
}

function applySemanticDiff(comparison, diff) {
  const changedKeys = new Set()
  for (const tableName of [...diff.redefinedTables, ...diff.alteredTables]) changedKeys.add(`table:${tableName}`)
  for (const indexName of [...diff.dropIndexes, ...diff.createdIndexes]) changedKeys.add(`index:${indexName}`)
  for (const item of comparison.rawChangedObjects) {
    if (item.type === 'trigger' || item.type === 'view') changedKeys.add(`${item.type}:${item.name}`)
  }
  const changedObjects = comparison.rawChangedObjects.filter((item) => changedKeys.has(`${item.type}:${item.name}`))
  const equivalentDefinitionObjects = comparison.rawChangedObjects
    .filter((item) => !changedKeys.has(`${item.type}:${item.name}`))
    .map(({ type, name, tableName }) => ({ type, name, tableName }))
  const { rawChangedObjects, ...rest } = comparison
  return { ...rest, changedObjects, equivalentDefinitionObjects }
}

function classify(comparison) {
  const hasDrift = comparison.extraObjects.length > 0
    || comparison.missingObjects.length > 0
    || comparison.changedObjects.length > 0
  if (!hasDrift) return { hasDrift, classification: 'NO_SCHEMA_DRIFT', recommendation: 'PROCEED_WITH_NORMAL_MIGRATION_GATES' }
  if (comparison.missingObjects.length > 0) {
    return { hasDrift, classification: 'MISSING_EXPECTED_SCHEMA_OBJECTS', recommendation: 'STOP_REPAIR_MISSING_OBJECTS_BEFORE_DEPLOY' }
  }
  if (comparison.extraTables.some((table) => table.rowCount > 0)) {
    return { hasDrift, classification: 'DATA_BEARING_REMOVED_SCHEMA', recommendation: 'STOP_ARCHIVE_AND_APPROVE_DATA_DISPOSITION' }
  }
  return { hasDrift, classification: 'SCHEMA_RECONCILIATION_REQUIRED', recommendation: 'BACKUP_TEST_RECONCILIATION_THEN_MAINTENANCE_WINDOW' }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const databasePath = path.resolve(options.database)
  const reportPath = path.resolve(options.report)
  if (await stat(reportPath).catch(() => null)) throw new Error('Schema 漂移报告必须写入不存在的新文件，不允许覆盖')
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-production-schema-audit-'))
  try {
    const evidence = await stableCopyEvidence(databasePath, temporaryRoot)
    const copiedDatabasePath = evidence.find((item) => item.sourcePath === databasePath).targetPath
    const snapshotPath = path.join(temporaryRoot, 'consistent-schema-audit.db')
    createConsistentSnapshot(copiedDatabasePath, snapshotPath)
    const expected = await buildExpectedMigrationDatabase(options['expected-ref'] || 'HEAD', temporaryRoot)
    const diff = prismaDiff(snapshotPath, expected.baselinePath)
    const comparison = applySemanticDiff(compareSchemaObjects(snapshotPath, expected.baselinePath), diff)
    const conclusion = classify(comparison)
    await assertSourceEvidenceUnchanged(evidence)
    const report = {
      format: 'mes-lite-production-schema-drift-audit',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      source: {
        databasePath,
        evidenceFiles: evidence.map(({ sourcePath, bytes, sha256 }) => ({ sourcePath, bytes, sha256 })),
        sourceFilesNeverOpenedBySqlite: true,
        unchangedAfterAudit: true,
      },
      expected: {
        requestedRef: expected.requestedRef,
        commit: expected.commit,
        version: expected.version,
        migrationCount: expected.migrationCount,
      },
      ...conclusion,
      comparison,
      prismaDiff: diff,
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    console.log(JSON.stringify({
      reportPath,
      expectedCommit: expected.commit,
      expectedVersion: expected.version,
      classification: conclusion.classification,
      recommendation: conclusion.recommendation,
      extraObjects: comparison.extraObjects.length,
      missingObjects: comparison.missingObjects.length,
      changedObjects: comparison.changedObjects.length,
      dataBearingExtraTables: comparison.extraTables.filter((table) => table.rowCount > 0),
      sourceUnchanged: true,
    }))
    if (conclusion.hasDrift) process.exitCode = 2
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`生产 Schema 漂移审计失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
