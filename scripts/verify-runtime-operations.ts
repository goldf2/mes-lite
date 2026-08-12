import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const root = process.cwd()

function runRuntimeBackup(args: string[]) {
  return execFileSync(process.execPath, ['scripts/runtime-backup.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
}

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-runtime-operations-'))
  const dataDirectory = path.join(temporaryRoot, 'data')
  const databasePath = path.join(dataDirectory, 'source.db')
  const uploadRoot = path.join(temporaryRoot, 'uploads')
  const backupDirectory = path.join(temporaryRoot, 'backups')
  const attachmentDirectory = path.join(uploadRoot, 'MATERIAL', 'material-1')
  const attachmentPath = path.join(attachmentDirectory, 'drawing.txt')
  const databaseUrl = `file:${databasePath}`
  let client: PrismaClient | undefined
  try {
  await mkdir(dataDirectory, { recursive: true })
  await mkdir(attachmentDirectory, { recursive: true })
  await mkdir(backupDirectory, { recursive: true })
  await writeFile(attachmentPath, 'MES-lite runtime backup attachment\n')
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
    stdio: 'pipe',
  })
  client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  await client.documentAttachment.create({
    data: {
      ownerType: 'MATERIAL', ownerId: 'material-1', originalName: 'drawing.txt',
      fileName: 'drawing.txt', mimeType: 'text/plain', size: 35,
      url: '/uploads/MATERIAL/material-1/drawing.txt', storagePath: attachmentPath,
    },
  })
  await client.$disconnect()
  client = undefined

  const created = JSON.parse(runRuntimeBackup([
    'create', '--database', databasePath, '--uploads', uploadRoot, '--backup-dir', backupDirectory,
    '--retention-count', '2', '--retention-days', '7',
  ]))
  assert.equal(created.command, 'create')
  assert.equal(created.databaseQuickCheck, 'ok')
  assert.equal(created.attachmentRows, 1)

  const archives = (await readdir(backupDirectory)).filter((entry) => entry.endsWith('.tar.gz'))
  assert.equal(archives.length, 1)
  const archivePath = path.join(backupDirectory, archives[0])
  const verified = JSON.parse(runRuntimeBackup(['verify', '--archive', archivePath]))
  assert.equal(verified.databaseQuickCheck, 'ok')
  assert.equal(verified.attachmentRows, 1)

  const restoreTarget = path.join(temporaryRoot, 'restore-candidate')
  const restored = JSON.parse(runRuntimeBackup(['stage-restore', '--archive', archivePath, '--target', restoreTarget]))
  assert.equal(restored.command, 'stage-restore')
  assert.equal(await readFile(path.join(restoreTarget, 'uploads', 'MATERIAL', 'material-1', 'drawing.txt'), 'utf8'), 'MES-lite runtime backup attachment\n')
    client = new PrismaClient({ datasources: { db: { url: `file:${path.join(restoreTarget, 'data', 'mes_lite.db')}` } } })
    assert.equal(await client.documentAttachment.count(), 1)
    await client.$disconnect()
    client = undefined
    const overwriteRejected = spawnSync(process.execPath, [
      'scripts/runtime-backup.mjs', 'stage-restore', '--archive', archivePath, '--target', restoreTarget,
    ], { cwd: root, encoding: 'utf8' })
    assert.notEqual(overwriteRejected.status, 0)
    assert.match(overwriteRejected.stderr, /不允许覆盖/)

    const drillTarget = path.join(temporaryRoot, 'drill-candidate')
    const drillReport = path.join(backupDirectory, 'drill-reports', 'isolated-recovery.md')
    const drilled = JSON.parse(runRuntimeBackup([
      'drill', '--archive', archivePath, '--target', drillTarget, '--report', drillReport,
      '--environment', 'isolated-ci', '--operator', 'runtime-verifier',
      '--rpo-hours', '24', '--rto-minutes', '60',
    ]))
    assert.equal(drilled.command, 'drill')
    assert.equal(drilled.scope, 'restore-candidate')
    assert.equal(drilled.status, 'CANDIDATE_PASS')
    assert.equal(drilled.metrics.rpo.pass, true)
    assert.equal(drilled.metrics.rto.pass, true)
    assert.equal(drilled.applicationSmoke.status, 'NOT_RUN')
    assert.equal(drilled.reportPath, drillReport)
    assert.match(drilled.backup.sha256, /^[a-f0-9]{64}$/)
    assert.equal(
      await readFile(path.join(drillTarget, 'uploads', 'MATERIAL', 'material-1', 'drawing.txt'), 'utf8'),
      'MES-lite runtime backup attachment\n',
    )
    const reportSource = await readFile(drillReport, 'utf8')
    assert.match(reportSource, /# MES-lite 恢复演练记录/)
    assert.match(reportSource, /候选恢复技术验收：通过/)
    assert.match(reportSource, /应用登录与业务抽查：未执行/)
    assert.match(reportSource, /isolated-ci/)
    assert.match(reportSource, /归档 SHA-256 \| [a-f0-9]{64}/)

    const reportOverwriteRejected = spawnSync(process.execPath, [
      'scripts/runtime-backup.mjs', 'drill', '--archive', archivePath,
      '--target', path.join(temporaryRoot, 'second-drill-candidate'), '--report', drillReport,
      '--environment', 'isolated-ci', '--operator', 'runtime-verifier',
    ], { cwd: root, encoding: 'utf8' })
    assert.notEqual(reportOverwriteRejected.status, 0)
    assert.match(reportOverwriteRejected.stderr, /演练报告必须写入不存在的新文件/)

    const missedRpoReport = path.join(backupDirectory, 'drill-reports', 'missed-rpo.md')
    const missedRpo = spawnSync(process.execPath, [
      'scripts/runtime-backup.mjs', 'drill', '--archive', archivePath,
      '--target', path.join(temporaryRoot, 'missed-rpo-candidate'), '--report', missedRpoReport,
      '--environment', 'isolated-ci', '--operator', 'runtime-verifier',
      '--rpo-hours', '0.0000001', '--rto-minutes', '60',
    ], { cwd: root, encoding: 'utf8' })
    assert.equal(missedRpo.status, 2)
    const missedRpoResult = JSON.parse(missedRpo.stdout)
    assert.equal(missedRpoResult.status, 'CANDIDATE_FAIL')
    assert.equal(missedRpoResult.metrics.rpo.pass, false)
    assert.match(await readFile(missedRpoReport, 'utf8'), /候选恢复技术验收：未通过/)

  const sidecarPath = `${archivePath}.sha256`
  const validSidecar = await readFile(sidecarPath, 'utf8')
  await writeFile(sidecarPath, `${'0'.repeat(64)}  ${path.basename(archivePath)}\n`)
  const rejected = spawnSync(process.execPath, ['scripts/runtime-backup.mjs', 'verify', '--archive', archivePath], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /SHA-256/)
  await writeFile(sidecarPath, validSidecar)

  runRuntimeBackup([
    'create', '--database', databasePath, '--uploads', uploadRoot, '--backup-dir', backupDirectory,
    '--retention-count', '2', '--retention-days', '7',
  ])
  runRuntimeBackup([
    'create', '--database', databasePath, '--uploads', uploadRoot, '--backup-dir', backupDirectory,
    '--retention-count', '2', '--retention-days', '7',
  ])
  const retainedEntries = await readdir(backupDirectory)
  assert.equal(retainedEntries.filter((entry) => entry.endsWith('.tar.gz')).length, 2)
  assert.equal(retainedEntries.filter((entry) => entry.endsWith('.tar.gz.sha256')).length, 2)

  await rm(attachmentPath)
  const missingAttachmentRejected = spawnSync(process.execPath, [
    'scripts/runtime-backup.mjs', 'create', '--database', databasePath, '--uploads', uploadRoot,
    '--backup-dir', backupDirectory, '--retention-count', '2', '--retention-days', '7', '--attempts', '1',
  ], { cwd: root, encoding: 'utf8' })
  assert.notEqual(missingAttachmentRejected.status, 0)
  assert.match(missingAttachmentRejected.stderr, /快照引用的附件未备份/)
  await writeFile(attachmentPath, 'MES-lite runtime backup attachment\n')

  process.env.DATABASE_URL = databaseUrl
  process.env.MES_LITE_DATA_DIR = dataDirectory
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot
  process.env.MES_LITE_BACKUP_DIR = backupDirectory
  const { evaluateRuntimeReadiness } = await import('../modules/operations-tools/server/runtime-readiness-service')
  const ready = await evaluateRuntimeReadiness()
  assert.equal(ready.status, 'ready')
  assert.equal(ready.checks.database.status, 'pass')
  assert.equal(ready.checks.migrations.status, 'pass')
  assert.equal(ready.checks.backupFreshness.status, 'pass')

  const pendingMigrationRoot = path.join(temporaryRoot, 'pending-migration-runtime')
  const pendingMigrationDirectory = path.join(pendingMigrationRoot, 'prisma', 'migrations')
  await mkdir(pendingMigrationDirectory, { recursive: true })
  const migrationEntries = await readdir(path.join(root, 'prisma', 'migrations'), { withFileTypes: true })
  await Promise.all(migrationEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => mkdir(path.join(pendingMigrationDirectory, entry.name))))
  await mkdir(path.join(pendingMigrationDirectory, '20990101000000_pending_test'))
  try {
    process.chdir(pendingMigrationRoot)
    const pendingMigration = await evaluateRuntimeReadiness()
    assert.equal(pendingMigration.status, 'unready')
    assert.equal(pendingMigration.checks.migrations.status, 'fail')
    assert.match(pendingMigration.checks.migrations.message, /1 条待应用/)
  } finally {
    process.chdir(root)
  }

  process.env.MES_LITE_UPLOAD_DIR = path.join(temporaryRoot, 'missing-uploads')
  const originalConsoleError = console.error
  console.error = () => undefined
  const unready = await evaluateRuntimeReadiness().finally(() => { console.error = originalConsoleError })
  assert.equal(unready.status, 'unready')
  assert.equal(unready.checks.attachmentStorage.status, 'fail')

  const middlewareSource = await readFile(path.join(root, 'middleware.ts'), 'utf8')
  assert.match(middlewareSource, /pathname\.startsWith\('\/api\/health\/'\)/)
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8')
  assert.match(dockerfile, /\/api\/health\/ready/)
  assert.match(dockerfile, /runtime-backup\.mjs create/)
  assert.match(dockerfile, /MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=false/)
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts['storage:drill'], 'node scripts/runtime-backup.mjs drill')
  const composeSource = await readFile(path.join(root, 'compose.yaml'), 'utf8')
  assert.match(composeSource, /MES_LITE_PRE_MIGRATION_BACKUP_ENABLED: "true"/)
  assert.match(composeSource, /\.\/\.runtime\/backups:\/app\/backups/)
  const trackedRuntimeFiles = execFileSync('git', [
    'ls-files', '--', 'prisma/mes_lite.db', 'tsconfig.tsbuildinfo',
  ], { cwd: root, encoding: 'utf8' }).trim()
  assert.equal(trackedRuntimeFiles, '')

  console.log('运维基线验证通过：SQLite 快照、附件校验、SHA-256、非覆盖恢复、RPO/RTO 报告与 readiness 降级均符合预期。')
  } finally {
    if (client) await client.$disconnect()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
