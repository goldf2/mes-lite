import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFile, cp, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth'

type Options = {
  database: string
  uploads: string
  target: string
  report: string
  environment: string
  operator: string
  'source-created-at'?: string
  'rpo-hours'?: string
  'rto-minutes'?: string
}

type Check = {
  status: 'PASS' | 'FAIL'
  detail: string
  durationMs: number
}

type AttachmentSample = {
  id: string
  storagePath: string
  size: number
  mimeType: string
}

const root = process.cwd()
let server: ChildProcess | null = null
let prisma: PrismaClient | null = null
let candidateDatabaseUrl: string | null = null
let temporaryOperatorId: string | null = null

function parseArgs(values: string[]) {
  const options: Record<string, string> = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`参数无效：${key || ''}`)
    options[key.slice(2)] = value
  }
  for (const required of ['database', 'uploads', 'target', 'report', 'environment', 'operator']) {
    if (!options[required]) throw new Error(`缺少参数 --${required}`)
  }
  return options as Options
}

function positiveNumber(value: string | undefined, fallback: number, label: string) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label}必须是正数`)
  return parsed
}

function safeMarkdown(value: string) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
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

async function regularFiles(directory: string, relativeRoot = ''): Promise<string[]> {
  const entries = await import('node:fs/promises').then(({ readdir }) => readdir(path.join(directory, relativeRoot), { withFileTypes: true }))
  const files: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeRoot, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`附件目录中不允许符号链接：${relativePath}`)
    if (entry.isDirectory()) files.push(...await regularFiles(directory, relativePath))
    else if (entry.isFile()) files.push(relativePath)
    else throw new Error(`附件目录中存在不支持的文件类型：${relativePath}`)
  }
  return files
}

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      listener.close((error) => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => server?.once('exit', () => resolve())),
    delay(3_000).then(() => { if (server?.exitCode === null) server.kill('SIGKILL') }),
  ])
}

async function waitForReady(baseUrl: string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`隔离应用已退出：${server?.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`)
      const body = await response.json() as { status?: string }
      if (response.status === 200 && body.status === 'ready') return body
    } catch {
      // 等待生产构建启动和数据库连接就绪。
    }
    await delay(300)
  }
  throw new Error('隔离应用 readiness 超时')
}

async function checked<T>(checks: Record<string, Check>, name: string, action: () => Promise<T>) {
  const startedAt = Date.now()
  try {
    const result = await action()
    checks[name] = { status: 'PASS', detail: '通过', durationMs: Date.now() - startedAt }
    return result
  } catch (error) {
    checks[name] = {
      status: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }
    throw error
  }
}

function parseSourceTime(value: string | undefined, databaseStat: Awaited<ReturnType<typeof stat>>) {
  if (!value) return databaseStat.mtime
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('--source-created-at 必须是有效 ISO 时间')
  return parsed
}

function legacyRelativePath(storagePath: string) {
  const legacyRoot = path.resolve(process.env.MES_LITE_LEGACY_UPLOAD_DIR || '/app/public/uploads')
  const relativePath = path.relative(legacyRoot, path.resolve(storagePath))
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('附件记录不属于旧容器标准目录')
  }
  return relativePath
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sourceDatabase = path.resolve(options.database)
  const sourceUploads = path.resolve(options.uploads)
  const targetRoot = path.resolve(options.target)
  const reportPath = path.resolve(options.report)
  const targetDatabase = path.join(targetRoot, 'data', 'mes_lite.db')
  const targetUploads = path.join(targetRoot, 'uploads')
  const partialRoot = `${targetRoot}.partial`
  const rpoHours = positiveNumber(options['rpo-hours'], 24, 'RPO 小时')
  const rtoMinutes = positiveNumber(options['rto-minutes'], 60, 'RTO 分钟')
  const startedAt = new Date()
  const checks: Record<string, Check> = {}

  for (const targetPath of [targetRoot, partialRoot, reportPath]) {
    if (await stat(targetPath).catch(() => null)) throw new Error(`输出已存在，拒绝覆盖：${targetPath}`)
  }
  const sourceDatabaseStat = await stat(sourceDatabase)
  const sourceTime = parseSourceTime(options['source-created-at'], sourceDatabaseStat)
  const sourceDatabaseSha256 = await sha256File(sourceDatabase)
  const sourceUploadFiles = await regularFiles(sourceUploads)
  const sourceUploadManifest = new Map<string, { bytes: number; sha256: string }>()

  try {
    await checked(checks, 'stageCandidate', async () => {
      await mkdir(path.join(partialRoot, 'data'), { recursive: true })
      await copyFile(sourceDatabase, path.join(partialRoot, 'data', 'mes_lite.db'))
      await cp(sourceUploads, path.join(partialRoot, 'uploads'), { recursive: true, force: false, errorOnExist: true })
      for (const relativePath of sourceUploadFiles) {
        const sourcePath = path.join(sourceUploads, relativePath)
        const metadata = await stat(sourcePath)
        sourceUploadManifest.set(relativePath, { bytes: metadata.size, sha256: await sha256File(sourcePath) })
      }
      assert.equal(await sha256File(path.join(partialRoot, 'data', 'mes_lite.db')), sourceDatabaseSha256, '候选库复制后 SHA-256 不一致')
      for (const [relativePath, expected] of Array.from(sourceUploadManifest.entries())) {
        const copiedPath = path.join(partialRoot, 'uploads', relativePath)
        const metadata = await stat(copiedPath)
        assert.equal(metadata.size, expected.bytes, `附件复制后大小不一致：${relativePath}`)
        assert.equal(await sha256File(copiedPath), expected.sha256, `附件复制后 SHA-256 不一致：${relativePath}`)
      }
      await rename(partialRoot, targetRoot)
    })

    const databaseUrl = `file:${targetDatabase}`
    candidateDatabaseUrl = databaseUrl
    await checked(checks, 'migrations', async () => {
      const child = await import('node:child_process').then(({ spawnSync }) => spawnSync(
        path.join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'],
        { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8' },
      ))
      if (child.status !== 0) throw new Error(child.stderr.trim() || child.stdout.trim() || 'Prisma 迁移失败')
    })

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const sourceCounts = await checked(checks, 'candidateIntegrity', async () => {
      const quickCheck = await prisma!.$queryRawUnsafe<Array<Record<string, unknown>>>('PRAGMA quick_check')
      const foreignKeys = await prisma!.$queryRawUnsafe<Array<Record<string, unknown>>>('PRAGMA foreign_key_check')
      assert.deepEqual(quickCheck.map((row) => Object.values(row)[0]), ['ok'])
      assert.equal(foreignKeys.length, 0)
      return {
        materials: await prisma!.material.count({ where: { deletedAt: null } }),
        stocks: await prisma!.stock.count(),
        productionOrders: await prisma!.productionOrder.count({ where: { deletedAt: null } }),
        attachments: await prisma!.documentAttachment.count({ where: { deletedAt: null } }),
      }
    })
    assert.ok(sourceCounts.materials > 0, '候选库没有可抽查物料')
    assert.ok(sourceCounts.stocks > 0, '候选库没有可抽查库存')
    assert.ok(sourceCounts.productionOrders > 0, '候选库没有可抽查生产订单')
    assert.ok(sourceCounts.attachments > 0, '候选库没有可抽查附件')

    const attachmentSample = await prisma.documentAttachment.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, storagePath: true, size: true, mimeType: true },
    }) as AttachmentSample | null
    assert.ok(attachmentSample, '候选库没有附件样本')
    const attachmentRelativePath = legacyRelativePath(attachmentSample.storagePath)
    const sourceAttachmentPath = path.join(sourceUploads, attachmentRelativePath)
    const expectedAttachmentSha256 = await sha256File(sourceAttachmentPath)
    const expectedAttachmentBytes = (await stat(sourceAttachmentPath)).size
    assert.equal(expectedAttachmentBytes, attachmentSample.size, '附件样本记录大小与原文件不一致')

    const drillUsername = `recovery-drill-${randomBytes(6).toString('hex')}`
    const drillPassword = randomBytes(24).toString('base64url')
    const drillOperator = await checked(checks, 'temporaryAdministrator', async () => prisma!.operator.create({
      data: {
        username: drillUsername,
        passwordHash: hashPassword(drillPassword),
        name: '隔离恢复演练管理员',
        role: 'ADMIN',
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy: 'APPLICATION_RECOVERY_DRILL',
      },
      select: { id: true },
    }))
    temporaryOperatorId = drillOperator.id
    await prisma.$disconnect()
    prisma = null

    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const backupDirectory = path.join(targetRoot, 'backups')
    await mkdir(backupDirectory)
    server = spawn(path.join(root, 'node_modules', '.bin', 'next'), ['start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        MES_LITE_DATA_DIR: path.join(targetRoot, 'data'),
        MES_LITE_UPLOAD_DIR: targetUploads,
        MES_LITE_BACKUP_DIR: backupDirectory,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    await checked(checks, 'readiness', async () => waitForReady(baseUrl))
    const cookie = await checked(checks, 'administratorLogin', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'User-Agent': 'mes-lite-recovery-drill' },
        body: JSON.stringify({ username: drillUsername, password: drillPassword }),
      })
      assert.equal(response.status, 200, `管理员登录返回 ${response.status}`)
      const value = response.headers.get('set-cookie')?.split(';')[0]
      assert.ok(value, '管理员登录未返回会话 Cookie')
      return value
    })
    const request = (requestPath: string) => fetch(`${baseUrl}${requestPath}`, { headers: { Cookie: cookie, Origin: baseUrl } })
    await checked(checks, 'businessReadOnlySmoke', async () => {
      const endpoints = [
        ['/api/materials?page=1&pageSize=1', '物料'],
        ['/api/stocks', '库存'],
        ['/api/orders?page=1&pageSize=1', '生产订单'],
      ] as const
      for (const [endpoint, label] of endpoints) {
        const response = await request(endpoint)
        assert.equal(response.status, 200, `${label}抽查返回 ${response.status}`)
        const body = await response.json() as { data?: unknown[] }
        assert.ok(Array.isArray(body.data) && body.data.length > 0, `${label}抽查未返回数据`)
      }
    })
    await checked(checks, 'attachmentFileSmoke', async () => {
      const response = await request(`/api/attachments/${attachmentSample.id}/file`)
      assert.equal(response.status, 200, `附件原文件返回 ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.equal(bytes.length, expectedAttachmentBytes, '附件 API 返回大小与原文件不一致')
      assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedAttachmentSha256, '附件 API 返回 SHA-256 与原文件不一致')
    })
    await stopServer()
    server = null
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    await checked(checks, 'temporaryAdministratorCleanup', async () => {
      await prisma!.operator.delete({ where: { id: drillOperator.id } })
      assert.equal(await prisma!.operator.count({ where: { id: drillOperator.id } }), 0)
    })
    temporaryOperatorId = null
    await prisma.$disconnect()
    prisma = null
    assert.equal(await sha256File(sourceDatabase), sourceDatabaseSha256, '演练期间源候选数据库发生变化')
    const completedAt = new Date()
    const rpoSeconds = Math.max(0, (startedAt.getTime() - sourceTime.getTime()) / 1000)
    const rtoSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000
    const rpoPass = rpoSeconds <= rpoHours * 60 * 60
    const rtoPass = rtoSeconds <= rtoMinutes * 60

    const reportDirectory = path.dirname(reportPath)
    await mkdir(reportDirectory, { recursive: true })
    const report = `# MES-lite 应用级恢复演练记录

> 证据范围：生产恢复候选的隔离副本。源候选和在线生产均未改写；报告不包含业务明细、附件名称、账号或密码。

## 1. 演练信息

| 项目 | 结果 |
| --- | --- |
| 环境 | ${safeMarkdown(options.environment)} |
| 操作人 | ${safeMarkdown(options.operator)} |
| 开始时间 | ${startedAt.toISOString()} |
| 应用验收完成时间 | ${completedAt.toISOString()} |
| 应用版本 | v${JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version} |
| 源候选 SHA-256 | ${sourceDatabaseSha256} |
| 源附件文件数 | ${sourceUploadFiles.length} |
| 隔离候选目录 | ${safeMarkdown(targetRoot)} |

## 2. 应用验收

| 检查 | 结论 | 耗时（毫秒） | 说明 |
| --- | --- | ---: | --- |
${Object.entries(checks).map(([name, check]) => `| ${name} | ${check.status} | ${check.durationMs} | ${safeMarkdown(check.detail)} |`).join('\n')}

抽查统计仅记录数量：物料 ${sourceCounts.materials}、库存 ${sourceCounts.stocks}、生产订单 ${sourceCounts.productionOrders}、有效附件 ${sourceCounts.attachments}。附件原文件通过 API 返回并与源文件 SHA-256 一致；隔离临时管理员已清理。

## 3. RPO / RTO

| 指标 | 实际 | 目标 | 结论 |
| --- | ---: | ---: | --- |
| RPO | ${rpoSeconds.toFixed(3)} 秒 | ≤ ${(rpoHours * 60 * 60).toFixed(0)} 秒 | ${rpoPass ? 'PASS' : 'FAIL'} |
| 完整应用 RTO | ${rtoSeconds.toFixed(3)} 秒 | ≤ ${(rtoMinutes * 60).toFixed(0)} 秒 | ${rtoPass ? 'PASS' : 'FAIL'} |

完整应用 RTO 从演练开始计算，包含候选复制、全附件哈希、迁移、生产构建启动、readiness、管理员登录、业务只读抽查、附件原文件抽查和临时账号清理。它不包含真实 Coolify 挂载切换。

结论：隔离应用恢复验收${rpoPass && rtoPass ? '通过' : '未通过'}。异地副本、真实 Coolify 挂载切换和企业真实岗位审批仍需独立验收。
`
    await writeFile(reportPath, report, { flag: 'wx' })
    console.log(JSON.stringify({
      status: rpoPass && rtoPass ? 'APPLICATION_PASS' : 'APPLICATION_FAIL',
      targetRoot,
      reportPath,
      sourceDatabaseSha256,
      sourceUploadFiles: sourceUploadFiles.length,
      checks,
      counts: sourceCounts,
      metrics: { rpoSeconds, rtoSeconds, rpoPass, rtoPass },
    }))
    if (!rpoPass || !rtoPass) process.exitCode = 2
  } finally {
    await stopServer()
    if (prisma) await prisma.$disconnect()
    if (temporaryOperatorId && candidateDatabaseUrl) {
      const cleanupClient = new PrismaClient({ datasources: { db: { url: candidateDatabaseUrl } } })
      await cleanupClient.operator.deleteMany({ where: { id: temporaryOperatorId } }).catch(() => undefined)
      await cleanupClient.$disconnect()
    }
    await rm(partialRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`应用级恢复演练失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
