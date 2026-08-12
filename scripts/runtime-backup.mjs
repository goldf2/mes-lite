import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PrismaClient } from '@prisma/client'

const execFileAsync = promisify(execFile)
const archivePrefix = 'mes-lite-backup-'
const archiveSuffix = '.tar.gz'
const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

class BackupConsistencyError extends Error {}

function parseArguments(values) {
  const [command, ...rest] = values
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]
    if (!item.startsWith('--')) throw new Error(`无法识别的参数：${item}`)
    const key = item.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`参数 --${key} 缺少值`)
    options[key] = value
    index += 1
  }
  return { command, options }
}

function positiveInteger(value, fallback, label) {
  const resolved = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(resolved) || resolved <= 0) throw new Error(`${label}必须是正整数`)
  return resolved
}

function resolveStoragePath(value, fallback) {
  return path.resolve(value || fallback)
}

function requireSafeStorageLayout(databasePath, uploadRoot, backupDirectory) {
  const databaseDirectory = path.dirname(databasePath)
  const pairs = [
    ['备份目录', backupDirectory, '数据库目录', databaseDirectory],
    ['备份目录', backupDirectory, '附件目录', uploadRoot],
  ]
  for (const [leftLabel, left, rightLabel, right] of pairs) {
    if (left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`)) {
      throw new Error(`${leftLabel}与${rightLabel}不能互相包含`)
    }
  }
}

function fileUrl(databasePath) {
  return `file:${databasePath}`
}

async function withDatabase(databasePath, operation) {
  const client = new PrismaClient({ datasources: { db: { url: fileUrl(databasePath) } } })
  try {
    return await operation(client)
  } finally {
    await client.$disconnect()
  }
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

async function listRegularFiles(root, relativeRoot = '') {
  const directory = path.join(root, relativeRoot)
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeRoot, entry.name)
    const absolutePath = path.join(root, relativePath)
    if (entry.isSymbolicLink()) throw new BackupConsistencyError(`备份目录中不允许符号链接：${relativePath}`)
    if (entry.isDirectory()) files.push(...await listRegularFiles(root, relativePath))
    else if (entry.isFile()) files.push({ relativePath, absolutePath })
    else throw new BackupConsistencyError(`备份目录中存在不支持的文件类型：${relativePath}`)
  }
  return files
}

function safeRelativeAttachmentPath(storagePath, uploadRoot) {
  const absolutePath = path.resolve(storagePath)
  const relativePath = path.relative(uploadRoot, absolutePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new BackupConsistencyError(`附件记录超出持久化目录：${storagePath}`)
  }
  return relativePath
}

async function inspectSnapshot(databasePath, uploadRoot, copiedUploadRoot) {
  return withDatabase(databasePath, async (client) => {
    const quickCheck = await client.$queryRawUnsafe('PRAGMA quick_check')
    const quickCheckValues = quickCheck.map((row) => String(row.quick_check ?? Object.values(row)[0]))
    if (quickCheckValues.length !== 1 || quickCheckValues[0] !== 'ok') {
      throw new BackupConsistencyError(`SQLite 一致性检查失败：${quickCheckValues.join(', ')}`)
    }
    const attachments = await client.documentAttachment.findMany({ select: { storagePath: true } })
    for (const attachment of attachments) {
      const relativePath = safeRelativeAttachmentPath(attachment.storagePath, uploadRoot)
      const copiedPath = path.join(copiedUploadRoot, relativePath)
      const copiedStat = await stat(copiedPath).catch(() => null)
      if (!copiedStat?.isFile()) {
        throw new BackupConsistencyError(`快照引用的附件未备份：${relativePath}`)
      }
    }
    return { quickCheck: 'ok', attachmentRows: attachments.length }
  })
}

async function createFileManifest(stageDirectory) {
  const files = await listRegularFiles(stageDirectory)
  const result = []
  for (const file of files) {
    if (file.relativePath === 'manifest.json') continue
    const metadata = await stat(file.absolutePath)
    result.push({
      path: file.relativePath.split(path.sep).join('/'),
      bytes: metadata.size,
      sha256: await sha256File(file.absolutePath),
    })
  }
  return result
}

async function applicationVersion() {
  const packagePath = path.join(applicationRoot, 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  return String(packageJson.version || 'unknown')
}

function archiveTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-')
}

async function createSqliteSnapshot(sourceDatabase, targetDatabase) {
  const sourceStat = await stat(sourceDatabase).catch(() => null)
  if (!sourceStat?.isFile() || sourceStat.size === 0) throw new Error('源 SQLite 数据库不存在或为空')
  const escapedTarget = targetDatabase.replaceAll("'", "''")
  await withDatabase(sourceDatabase, (client) => client.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}'`))
}

async function buildBackupAttempt(input) {
  const stageDirectory = await mkdtemp(path.join(input.backupDirectory, '.creating-'))
  const databaseSnapshot = path.join(stageDirectory, 'database.sqlite3')
  const copiedUploadRoot = path.join(stageDirectory, 'uploads')
  try {
    await createSqliteSnapshot(input.databasePath, databaseSnapshot)
    await cp(input.uploadRoot, copiedUploadRoot, { recursive: true, force: false, errorOnExist: true })
    const snapshot = await inspectSnapshot(databaseSnapshot, input.uploadRoot, copiedUploadRoot)
    const files = await createFileManifest(stageDirectory)
    const uploadFiles = files.filter((file) => file.path.startsWith('uploads/'))
    const manifest = {
      format: 'mes-lite-runtime-backup',
      formatVersion: 1,
      appVersion: await applicationVersion(),
      createdAt: new Date().toISOString(),
      database: {
        file: 'database.sqlite3',
        quickCheck: snapshot.quickCheck,
      },
      uploads: {
        directory: 'uploads',
        sourceRoot: input.uploadRoot,
        attachmentRows: snapshot.attachmentRows,
        fileCount: uploadFiles.length,
        bytes: uploadFiles.reduce((total, file) => total + file.bytes, 0),
      },
      files,
    }
    await writeFile(path.join(stageDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    return { stageDirectory, manifest }
  } catch (error) {
    await rm(stageDirectory, { recursive: true, force: true })
    throw error
  }
}

async function runTar(args) {
  try {
    await execFileAsync('tar', args, { maxBuffer: 16 * 1024 * 1024 })
  } catch (error) {
    const detail = error.stderr?.trim() || error.message
    throw new Error(`tar 执行失败：${detail}`)
  }
}

async function enforceRetention(backupDirectory, retentionCount, retentionDays, currentArchive) {
  const entries = await readdir(backupDirectory, { withFileTypes: true })
  const archives = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(archivePrefix) || !entry.name.endsWith(archiveSuffix)) continue
    const archivePath = path.join(backupDirectory, entry.name)
    const metadata = await stat(archivePath)
    archives.push({ archivePath, modifiedAt: metadata.mtimeMs })
  }
  archives.sort((left, right) => right.modifiedAt - left.modifiedAt)
  const oldestAllowed = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const removed = []
  for (let index = 0; index < archives.length; index += 1) {
    const archive = archives[index]
    if (archive.archivePath === currentArchive) continue
    if (index >= retentionCount || archive.modifiedAt < oldestAllowed) {
      await rm(archive.archivePath, { force: true })
      await rm(`${archive.archivePath}.sha256`, { force: true })
      removed.push(path.basename(archive.archivePath))
    }
  }
  return removed
}

async function createBackup(options) {
  const databasePath = resolveStoragePath(
    options.database || process.env.MES_LITE_DATABASE_PATH,
    path.join(applicationRoot, 'prisma', 'mes_lite.db'),
  )
  const uploadRoot = resolveStoragePath(
    options.uploads || process.env.MES_LITE_UPLOAD_DIR,
    path.join(applicationRoot, 'public', 'uploads'),
  )
  const backupDirectory = resolveStoragePath(
    options['backup-dir'] || process.env.MES_LITE_BACKUP_DIR,
    path.join(applicationRoot, '.runtime', 'backups'),
  )
  const retentionCount = positiveInteger(options['retention-count'] || process.env.MES_LITE_BACKUP_RETENTION_COUNT, 30, '备份保留数量')
  const retentionDays = positiveInteger(options['retention-days'] || process.env.MES_LITE_BACKUP_RETENTION_DAYS, 14, '备份保留天数')
  const attempts = positiveInteger(options.attempts, 3, '一致性备份尝试次数')
  requireSafeStorageLayout(databasePath, uploadRoot, backupDirectory)
  await access(uploadRoot)
  await mkdir(backupDirectory, { recursive: true })

  let backupAttempt
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      backupAttempt = await buildBackupAttempt({ databasePath, uploadRoot, backupDirectory })
      break
    } catch (error) {
      lastError = error
      if (!(error instanceof BackupConsistencyError) || attempt === attempts) throw error
    }
  }
  if (!backupAttempt) throw lastError || new Error('无法创建备份')

  const archiveName = `${archivePrefix}${archiveTimestamp()}-${randomUUID().slice(0, 8)}.tar.gz`
  const archivePath = path.join(backupDirectory, archiveName)
  const partialArchive = `${archivePath}.partial`
  try {
    await runTar(['-czf', partialArchive, '-C', backupAttempt.stageDirectory, 'database.sqlite3', 'uploads', 'manifest.json'])
    await rename(partialArchive, archivePath)
    const archiveHash = await sha256File(archivePath)
    await writeFile(`${archivePath}.sha256`, `${archiveHash}  ${archiveName}\n`, { flag: 'wx' })
    const verified = await verifyBackupArchive(archivePath)
    const removed = await enforceRetention(backupDirectory, retentionCount, retentionDays, archivePath)
    return { command: 'create', archivePath, sha256: archiveHash, removed, ...verified.summary }
  } catch (error) {
    await rm(partialArchive, { force: true })
    await rm(archivePath, { force: true })
    await rm(`${archivePath}.sha256`, { force: true })
    throw error
  } finally {
    await rm(backupAttempt.stageDirectory, { recursive: true, force: true })
  }
}

function validateArchiveEntry(entry) {
  const normalized = entry.replace(/^\.\//, '').replace(/\/$/, '')
  if (!normalized) return
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`备份包含不安全路径：${entry}`)
  if (normalized !== 'database.sqlite3' && normalized !== 'manifest.json' && normalized !== 'uploads' && !normalized.startsWith('uploads/')) {
    throw new Error(`备份包含未知条目：${entry}`)
  }
}

async function verifySidecar(archivePath) {
  const sidecarPath = `${archivePath}.sha256`
  const content = await readFile(sidecarPath, 'utf8').catch(() => '')
  const [expectedHash, expectedName] = content.trim().split(/\s+/)
  if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || expectedName !== path.basename(archivePath)) {
    throw new Error('备份 SHA-256 侧车文件无效')
  }
  const actualHash = await sha256File(archivePath)
  if (actualHash !== expectedHash) throw new Error('备份包 SHA-256 校验失败')
  return actualHash
}

async function validateExtractedBackup(extractedDirectory) {
  const manifestPath = path.join(extractedDirectory, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.format !== 'mes-lite-runtime-backup' || manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('备份清单格式不受支持')
  }
  if (manifest.database?.file !== 'database.sqlite3' || manifest.uploads?.directory !== 'uploads') {
    throw new Error('备份清单的数据库或附件路径无效')
  }
  const listedPaths = new Set()
  for (const file of manifest.files) {
    validateArchiveEntry(file.path)
    if (listedPaths.has(file.path)) throw new Error(`备份清单路径重复：${file.path}`)
    listedPaths.add(file.path)
    const absolutePath = path.join(extractedDirectory, file.path)
    const metadata = await stat(absolutePath).catch(() => null)
    if (!metadata?.isFile() || metadata.size !== file.bytes) throw new Error(`备份文件大小不一致：${file.path}`)
    if (await sha256File(absolutePath) !== file.sha256) throw new Error(`备份文件校验失败：${file.path}`)
  }
  const actualFiles = await listRegularFiles(extractedDirectory)
  const actualDataPaths = actualFiles
    .map((file) => file.relativePath.split(path.sep).join('/'))
    .filter((item) => item !== 'manifest.json')
  if (actualDataPaths.some((item) => !listedPaths.has(item)) || listedPaths.size !== actualDataPaths.length) {
    throw new Error('备份包内容与文件清单不一致')
  }
  const databasePath = path.join(extractedDirectory, manifest.database.file)
  const copiedUploadRoot = path.join(extractedDirectory, manifest.uploads.directory)
  const snapshot = await inspectSnapshot(databasePath, path.resolve(manifest.uploads.sourceRoot), copiedUploadRoot)
  if (snapshot.attachmentRows !== manifest.uploads.attachmentRows) throw new Error('附件记录数与备份清单不一致')
  return {
    manifest,
    summary: {
      appVersion: manifest.appVersion,
      createdAt: manifest.createdAt,
      attachmentRows: snapshot.attachmentRows,
      fileCount: manifest.files.length,
      databaseQuickCheck: snapshot.quickCheck,
    },
  }
}

async function verifyBackupArchive(archivePathValue, keepExtracted = false) {
  const archivePath = path.resolve(archivePathValue)
  await verifySidecar(archivePath)
  const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], { maxBuffer: 16 * 1024 * 1024 })
  stdout.split('\n').filter(Boolean).forEach(validateArchiveEntry)
  const { stdout: verboseListing } = await execFileAsync('tar', ['-tvzf', archivePath], { maxBuffer: 16 * 1024 * 1024 })
  if (verboseListing.split('\n').filter(Boolean).some((entry) => !['-', 'd'].includes(entry[0]))) {
    throw new Error('备份包不允许符号链接、硬链接或特殊文件')
  }
  const extractedDirectory = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-backup-verify-'))
  let succeeded = false
  try {
    await runTar(['-xzf', archivePath, '-C', extractedDirectory])
    const validated = await validateExtractedBackup(extractedDirectory)
    succeeded = true
    return { ...validated, extractedDirectory: keepExtracted ? extractedDirectory : undefined }
  } finally {
    if (!keepExtracted || !succeeded) await rm(extractedDirectory, { recursive: true, force: true })
  }
}

async function verifyBackup(options) {
  if (!options.archive) throw new Error('verify 需要 --archive')
  const verified = await verifyBackupArchive(options.archive)
  return { command: 'verify', archivePath: path.resolve(options.archive), ...verified.summary }
}

async function stageRestore(options) {
  if (!options.archive || !options.target) throw new Error('stage-restore 需要 --archive 和 --target')
  const targetRoot = path.resolve(options.target)
  const parent = path.dirname(targetRoot)
  await access(parent)
  const existing = await lstat(targetRoot).catch(() => null)
  if (existing) throw new Error('恢复候选目录必须不存在，不允许覆盖')
  const verified = await verifyBackupArchive(options.archive, true)
  let targetCreated = false
  try {
    await mkdir(targetRoot)
    targetCreated = true
    await mkdir(path.join(targetRoot, 'data'))
    await cp(path.join(verified.extractedDirectory, 'database.sqlite3'), path.join(targetRoot, 'data', 'mes_lite.db'), { errorOnExist: true })
    await cp(path.join(verified.extractedDirectory, 'uploads'), path.join(targetRoot, 'uploads'), { recursive: true, force: false, errorOnExist: true })
    await cp(path.join(verified.extractedDirectory, 'manifest.json'), path.join(targetRoot, 'manifest.json'), { errorOnExist: true })
    await inspectSnapshot(
      path.join(targetRoot, 'data', 'mes_lite.db'),
      path.resolve(verified.manifest.uploads.sourceRoot),
      path.join(targetRoot, 'uploads'),
    )
    return { command: 'stage-restore', targetRoot, ...verified.summary }
  } catch (error) {
    if (targetCreated) await rm(targetRoot, { recursive: true, force: true })
    throw error
  } finally {
    await rm(verified.extractedDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2))
  const result = command === 'create' ? await createBackup(options)
    : command === 'verify' ? await verifyBackup(options)
    : command === 'stage-restore' ? await stageRestore(options)
    : null
  if (!result) throw new Error('用法：node scripts/runtime-backup.mjs <create|verify|stage-restore> [--参数 值]')
  console.log(JSON.stringify(result))
}

main().catch((error) => {
  console.error(`运行时数据备份操作失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
