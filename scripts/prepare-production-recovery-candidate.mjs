import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const targetMigration = '20260812223000_add_material_projections_for_product_exit'
const expectedUnexpectedMigrations = [
  '20260729180000_add_profile_entity_inventory',
  '20260729183000_add_profile_line_sort_order',
  '20260729203000_add_cutting_demands_and_plans',
  '20260729230000_add_cutting_execution_and_remnants',
  '20260730001000_add_cutting_remnant_ledger_fields',
  '20260730020000_add_production_lots_drilling_quality',
]
const expectedMissingIndexes = [
  'BOM_materialId_idx',
  'BomCostRun_materialId_createdAt_idx',
  'ProcessRoute_materialId_idx',
  'Product_materialId_key',
  'SawingCostScenario_materialId_idx',
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
  if (!options.database || !options.output || !options.report) {
    throw new Error('用法：prepare-production-recovery-candidate --database <mes_lite.db> --output <不存在的.db> --report <不存在的.json> [--expected-ref <git-ref>]')
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} 执行失败：${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout.trim()
}

function sqliteJson(databasePath, sql) {
  const output = run('sqlite3', ['-json', databasePath, sql])
  return output ? JSON.parse(output) : []
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}；实际=${JSON.stringify(actual)}，预期=${JSON.stringify(expected)}`)
  }
}

async function copySourceEvidence(databasePath, temporaryRoot) {
  const sourcePaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`]
  const evidence = []
  for (const sourcePath of sourcePaths) {
    const sourceStat = await stat(sourcePath).catch(() => null)
    if (!sourceStat?.isFile()) continue
    const before = await sha256File(sourcePath)
    const copiedPath = path.join(temporaryRoot, path.basename(sourcePath))
    await copyFile(sourcePath, copiedPath)
    const after = await sha256File(sourcePath)
    if (before !== after) throw new Error(`复制期间源文件发生变化，请停止应用写入后重试：${sourcePath}`)
    evidence.push({ sourcePath, copiedPath, bytes: sourceStat.size, sha256: before })
  }
  if (!evidence.some((item) => item.sourcePath === databasePath)) throw new Error('源数据库不存在或不是普通文件')
  return evidence
}

function validatePreAudit(audit) {
  assertEqual(audit.snapshot.quickCheck, ['ok'], '源快照 quick_check 未通过')
  assertEqual(audit.snapshot.integrityCheck, ['ok'], '源快照 integrity_check 未通过')
  assertEqual(audit.snapshot.foreignKeyCheck, [], '源快照存在外键错误')
  assertEqual(audit.migrationState.otherActiveFailures, [], '存在目标迁移之外的活动失败')
  assertEqual(audit.migrationState.expectedChecksumMismatches, [], '目标版本迁移校验和不一致')
  assertEqual([...audit.migrationState.unexpectedApplied].sort(), [...expectedUnexpectedMigrations].sort(), '意外迁移集合不符合已审计生产库')
  if (audit.knownMigration.classification !== 'STRUCTURE_PARTIALLY_APPLIED_STATUS_FAILED') {
    throw new Error(`目标迁移状态不是已审计的部分执行状态：${audit.knownMigration.classification}`)
  }
  if (audit.knownMigration.checksumMatches !== true || audit.knownMigration.existingStructureMismatch) {
    throw new Error('目标迁移校验和或既有结构不符合恢复前提')
  }
  if (!audit.knownMigration.columns.every((item) => item.matches)) throw new Error('六个 materialId 列没有全部精确匹配')
  const missingIndexes = audit.knownMigration.indexes.filter((item) => !item.matches).map((item) => item.name).sort()
  assertEqual(missingIndexes, [...expectedMissingIndexes].sort(), '缺失索引集合与已审计状态不同')
}

function validateLegacyConflict(databasePath) {
  const tableRows = sqliteJson(databasePath, `
    SELECT 'ProductionLot' AS name, COUNT(*) AS rowCount FROM "ProductionLot"
    UNION ALL SELECT 'DrillingReport', COUNT(*) FROM "DrillingReport"
    UNION ALL SELECT 'QualityInspection', COUNT(*) FROM "QualityInspection";
  `)
  assertEqual(tableRows, [
    { name: 'ProductionLot', rowCount: 0 },
    { name: 'DrillingReport', rowCount: 0 },
    { name: 'QualityInspection', rowCount: 0 },
  ], '旧批次、钻孔或质检表已有数据，禁止自动归档冲突表')
  const qualityColumns = sqliteJson(databasePath, 'PRAGMA table_info("QualityInspection");').map((row) => row.name)
  if (!qualityColumns.includes('clientRequestId') || !qualityColumns.includes('productionLotId') || qualityColumns.includes('lotId')) {
    throw new Error('QualityInspection 不是已审计的撤回分支旧结构')
  }
  const productDuplicates = sqliteJson(databasePath, `
    SELECT "materialId", COUNT(*) AS rowCount
    FROM "Product"
    WHERE "materialId" IS NOT NULL
    GROUP BY "materialId"
    HAVING COUNT(*) > 1;
  `)
  assertEqual(productDuplicates, [], 'Product.materialId 存在非空重复值，无法建立唯一索引')
}

function repairKnownDrift(databasePath) {
  run('sqlite3', [databasePath, `
    PRAGMA foreign_keys=ON;
    BEGIN IMMEDIATE;
    ALTER TABLE "QualityInspection" RENAME TO "LegacyProfileQualityInspection";
    DROP INDEX "QualityInspection_clientRequestId_key";
    DROP INDEX "QualityInspection_inspectionNo_key";
    DROP INDEX "QualityInspection_productionLotId_checkedAt_idx";
    DROP INDEX "QualityInspection_status_idx";
    CREATE UNIQUE INDEX "Product_materialId_key" ON "Product"("materialId");
    CREATE INDEX "BOM_materialId_idx" ON "BOM"("materialId");
    CREATE INDEX "BomCostRun_materialId_createdAt_idx" ON "BomCostRun"("materialId", "createdAt");
    CREATE INDEX "ProcessRoute_materialId_idx" ON "ProcessRoute"("materialId");
    CREATE INDEX "SawingCostScenario_materialId_idx" ON "SawingCostScenario"("materialId");
    COMMIT;
  `])
}

function extractExpectedRelease(expectedCommit, temporaryRoot) {
  const archivePath = path.join(temporaryRoot, 'expected-release.tar')
  const releaseRoot = path.join(temporaryRoot, 'expected-release')
  const archive = execFileSync('git', ['archive', expectedCommit, 'prisma', 'package.json', 'package-lock.json'], {
    cwd: process.cwd(),
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  })
  return writeFile(archivePath, archive)
    .then(() => run('mkdir', ['-p', releaseRoot]))
    .then(() => run('tar', ['-xf', archivePath, '-C', releaseRoot]))
    .then(() => releaseRoot)
}

function prismaMigrate(databasePath, releaseRoot) {
  const prismaCli = path.resolve('node_modules/prisma/build/index.js')
  const schemaPath = path.join(releaseRoot, 'prisma', 'schema.prisma')
  const env = { ...process.env, DATABASE_URL: `file:${databasePath}` }
  const resolveOutput = run(process.execPath, [prismaCli, 'migrate', 'resolve', '--applied', targetMigration, '--schema', schemaPath], { env })
  const deployOutput = run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], { env })
  const statusOutput = run(process.execPath, [prismaCli, 'migrate', 'status', '--schema', schemaPath], { env })
  return { resolveOutput, deployOutput, statusOutput }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const databasePath = path.resolve(options.database)
  const outputPath = path.resolve(options.output)
  const reportPath = path.resolve(options.report)
  for (const targetPath of [outputPath, reportPath, `${outputPath}.partial`]) {
    if (await stat(targetPath).catch(() => null)) throw new Error(`输出已存在，拒绝覆盖：${targetPath}`)
  }
  const expectedRef = options['expected-ref'] || 'be7e18f'
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-production-recovery-'))
  const partialPath = `${outputPath}.partial`
  try {
    const auditReportPath = path.join(temporaryRoot, 'pre-audit.json')
    run(process.execPath, [
      path.resolve('scripts/audit-production-database.mjs'),
      '--database', databasePath,
      '--report', auditReportPath,
      '--expected-ref', expectedRef,
    ])
    const preAudit = JSON.parse(await readFile(auditReportPath, 'utf8'))
    validatePreAudit(preAudit)

    const evidence = await copySourceEvidence(databasePath, temporaryRoot)
    const copiedDatabasePath = evidence.find((item) => item.sourcePath === databasePath).copiedPath
    run('sqlite3', [copiedDatabasePath, '.timeout 30000', `.backup '${partialPath.replaceAll("'", "''")}'`])
    validateLegacyConflict(partialPath)
    repairKnownDrift(partialPath)

    const releaseRoot = await extractExpectedRelease(preAudit.expected.commit, temporaryRoot)
    const migrate = prismaMigrate(partialPath, releaseRoot)
    const quickCheck = sqliteJson(partialPath, 'PRAGMA quick_check;').map((row) => row.quick_check)
    const integrityCheck = sqliteJson(partialPath, 'PRAGMA integrity_check;').map((row) => row.integrity_check)
    const foreignKeyCheck = sqliteJson(partialPath, 'PRAGMA foreign_key_check;')
    assertEqual(quickCheck, ['ok'], '候选库 quick_check 未通过')
    assertEqual(integrityCheck, ['ok'], '候选库 integrity_check 未通过')
    assertEqual(foreignKeyCheck, [], '候选库存在外键错误')
    const pending = sqliteJson(partialPath, `
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL;
    `)
    assertEqual(pending, [], '候选库仍有活动失败迁移')

    await rm(`${partialPath}-journal`, { force: true })
    await rm(`${partialPath}-wal`, { force: true })
    await rm(`${partialPath}-shm`, { force: true })
    await rename(partialPath, outputPath)
    const outputStat = await stat(outputPath)
    const report = {
      format: 'mes-lite-production-recovery-candidate',
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      expectedRelease: {
        requestedRef: preAudit.expected.requestedRef,
        commit: preAudit.expected.commit,
        version: preAudit.expected.version,
      },
      source: {
        databasePath,
        snapshotSha256: preAudit.snapshot.sha256,
        evidenceFiles: evidence.map(({ sourcePath, bytes, sha256 }) => ({ sourcePath, bytes, sha256 })),
        sourceFilesNeverOpenedBySqlite: true,
      },
      recovery: {
        archivedConflictTable: 'LegacyProfileQualityInspection',
        repairedIndexes: expectedMissingIndexes,
        resolvedMigration: targetMigration,
        appliedMigrations: preAudit.migrationState.pendingExpected.filter((name) => name !== targetMigration),
        intentionallyPreservedUnexpectedMigrations: expectedUnexpectedMigrations,
      },
      candidate: {
        databasePath: outputPath,
        bytes: outputStat.size,
        sha256: await sha256File(outputPath),
        quickCheck,
        integrityCheck,
        foreignKeyCheck,
        prismaStatus: migrate.statusOutput,
      },
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    console.log(JSON.stringify({
      outputPath,
      reportPath,
      version: report.expectedRelease.version,
      commit: report.expectedRelease.commit,
      sha256: report.candidate.sha256,
      quickCheck: quickCheck.join(', '),
      foreignKeyErrors: foreignKeyCheck.length,
    }))
  } finally {
    await rm(partialPath, { force: true })
    await rm(`${partialPath}-journal`, { force: true })
    await rm(`${partialPath}-wal`, { force: true })
    await rm(`${partialPath}-shm`, { force: true })
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`生产恢复候选生成失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
