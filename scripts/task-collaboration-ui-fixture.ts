import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PrismaClient } from '@prisma/client'

/** Local-only fixture. Importing this module does not start Next or a browser. */
export const taskUiRoot = process.cwd()
const nativeRequire = createRequire(import.meta.url)

export function loadTaskUiPlaywright() {
  const candidates: string[] = []
  if (process.env.MES_TASK_UI_PLAYWRIGHT_MODULE) candidates.push(process.env.MES_TASK_UI_PLAYWRIGHT_MODULE)
  try { candidates.push(nativeRequire.resolve('playwright')) } catch { /* not a project dependency */ }
  const cacheRoot = join(homedir(), '.npm', '_npx')
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot).sort()) {
      const candidate = join(cacheRoot, entry, 'node_modules', 'playwright')
      if (existsSync(join(candidate, 'package.json'))) candidates.push(candidate)
    }
  }
  for (const candidate of candidates) {
    try {
      const driver = nativeRequire(candidate)
      if (driver.chromium && existsSync(driver.chromium.executablePath())) return driver
    } catch { /* try another existing installation; never download */ }
  }
  throw new Error('没有可用的既有 Playwright + Chromium。设置 MES_TASK_UI_PLAYWRIGHT_MODULE 指向本机已安装模块；本测试不会安装依赖。')
}

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const listener = createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      listener.close(error => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

async function stopChild(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<boolean>(resolve => child.once('close', () => resolve(true)))
  child.kill('SIGTERM')
  if (await Promise.race([exited, delay(3_000).then(() => false)])) return
  child.kill('SIGKILL')
  assert.equal(await Promise.race([exited, delay(3_000).then(() => false)]), true,
    '本地 Next 验证服务未在终止期限内退出')
}

export async function startTaskUiHarness() {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    assert.equal(existsSync(join(taskUiRoot, name)), false, '本地验证候选不得包含会被 Next/Prisma 自动读取的真实 dotenv 文件')
  }
  const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-task-ui-'))
  const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`
  const artifacts = process.env.MES_TASK_UI_ARTIFACT_DIR || join(taskUiRoot, 'work', 'task-ui-evidence', runId)
  mkdirSync(artifacts, { recursive: true })
  const password = `Synthetic-${randomUUID()}!`
  const testEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'development', PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
    DATABASE_URL: databaseUrl, MES_LITE_UPLOAD_DIR: join(verifyRoot, 'uploads'),
    MES_LITE_LEGACY_UPLOAD_DIR: join(verifyRoot, 'no-legacy-files'),
    NEXT_TELEMETRY_DISABLED: '1', APP_LOGIN_MODE: 'builtin',
  }
  let server: ChildProcess | null = null
  let serverLog = ''
  let db: PrismaClient | null = null
  let cleanupPromise: Promise<void> | null = null
  const cleanup = () => {
    if (!cleanupPromise) cleanupPromise = (async () => {
      try {
        await stopChild(server)
        await db?.$disconnect()
      } finally { rmSync(verifyRoot, { recursive: true, force: true }) }
    })()
    return cleanupPromise
  }
  try {
    execFileSync(join(taskUiRoot, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: taskUiRoot, env: testEnvironment, stdio: 'pipe',
    })
    process.env.DATABASE_URL = databaseUrl
    process.env.MES_LITE_UPLOAD_DIR = testEnvironment.MES_LITE_UPLOAD_DIR
    const { hashPassword } = await import('../lib/auth')
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const database = db
    const [employee, outsiderEmployee, workCenter, material, supplier] = await Promise.all([
      database.employee.create({ data: { code: 'UI-EMP-A', name: '界面合成员工甲' } }),
      database.employee.create({ data: { code: 'UI-EMP-B', name: '界面范围外员工乙' } }),
      database.workCenter.create({ data: { code: 'UI-WC-A', name: '界面合成工作中心' } }),
      database.material.create({ data: { code: 'UI-MAT-A', name: '界面合成零件', unit: '件', stockUnit: '件', valuationUnit: 'kg' } }),
      database.supplier.create({ data: { code: 'UI-SUP-A', name: '界面合成供应商' } }),
    ])
    const resources = ['dashboard', 'taskCollaboration', 'taskCollaborationPublish', 'materials', 'employees', 'suppliers', 'orders', 'salesOrder', 'dispatch', 'workCenters', 'attachments']
    const [fullGroup, readGroup, deniedGroup, missingAttachmentsGroup, updateAttachmentsGroup] = await Promise.all([
      database.permissionGroup.create({ data: { code: 'ui-task-full', name: '本地界面全能力合成组', settings: { create: resources.map(resource => ({ resource, canRead: true, canCreate: true, canUpdate: true, canDelete: true })) } } }),
      database.permissionGroup.create({ data: { code: 'ui-task-read', name: '本地界面只读合成组', settings: { create: resources.map(resource => ({ resource, canRead: resource !== 'taskCollaborationPublish', canCreate: false, canUpdate: false, canDelete: false })) } } }),
      database.permissionGroup.create({ data: { code: 'ui-task-denied', name: '本地界面无任务权限组', settings: { create: resources.map(resource => ({ resource, canRead: resource === 'dashboard', canCreate: false, canUpdate: false, canDelete: false })) } } }),
      database.permissionGroup.create({ data: { code: 'ui-task-no-attachments', name: '本地任务可改但无附件权限', settings: { create: resources.filter(resource => resource !== 'attachments').map(resource => ({ resource, canRead: true, canCreate: true, canUpdate: true, canDelete: true })) } } }),
      database.permissionGroup.create({ data: { code: 'ui-task-attachments-update-only', name: '本地附件可改但不可新建', settings: { create: resources.map(resource => ({ resource, canRead: true, canCreate: resource !== 'attachments', canUpdate: true, canDelete: true })) } } }),
    ])
    const createActor = (username: string, groupId: string, employeeId?: string, self = false) => database.operator.create({ data: {
      username, name: username, role: 'OPERATOR', status: 'ACTIVE', passwordHash: hashPassword(password),
      permissionGroups: { create: { groupId } },
      ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
      dataScope: { create: { productionMode: self ? 'SELF' : 'ALL', inventoryMode: 'ALL' } },
    } })
    const [author, readOnly, denied, outsider, missingAttachments, updateAttachmentsOnly] = await Promise.all([
      createActor('task-ui-author', fullGroup.id, employee.id),
      createActor('task-ui-read-only', readGroup.id),
      createActor('task-ui-denied', deniedGroup.id),
      createActor('task-ui-outsider', fullGroup.id, outsiderEmployee.id, true),
      createActor('task-ui-no-attachments', missingAttachmentsGroup.id),
      createActor('task-ui-attachment-update-only', updateAttachmentsGroup.id),
    ])
    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    server = spawn(join(taskUiRoot, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: taskUiRoot, env: { ...testEnvironment, APP_ORIGIN: baseUrl }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const collectLog = (chunk: Buffer) => { serverLog = (serverLog + chunk.toString()).slice(-24_000) }
    server.stdout?.on('data', collectLog)
    server.stderr?.on('data', collectLog)
    const deadline = Date.now() + 120_000
    let ready = false
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`本地 Next 验证服务已退出：${server.exitCode}`)
      try {
        if ((await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10_000) })).ok) { ready = true; break }
      } catch { /* local compilation only */ }
      await delay(300)
    }
    assert.equal(ready, true, '本地 Next 验证服务启动超时')
    const drawing = Buffer.from('SYNTHETIC LOCAL TASK UI DRAWING\nRevision A\nNo production content.\n')
    const fixturePath = join(verifyRoot, 'synthetic-ui-fixture.json')
    writeFileSync(fixturePath, JSON.stringify({ baseUrl, username: author.username, password,
      readOnlyUsername: readOnly.username, deniedUsername: denied.username, outsiderUsername: outsider.username,
      missingAttachmentsUsername: missingAttachments.username, updateAttachmentsOnlyUsername: updateAttachmentsOnly.username,
      employeeId: employee.id, materialId: material.id, workCenterId: workCenter.id,
    }), { mode: 0o600 })
    return {
      db: database, baseUrl, artifacts, password, fixturePath, actors: { author, readOnly, denied, outsider, missingAttachments, updateAttachmentsOnly },
      fixture: { employee, workCenter, material, supplier, drawing, drawingHash: createHash('sha256').update(drawing).digest('hex') },
      serverLog: () => serverLog, cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export type TaskUiHarness = Awaited<ReturnType<typeof startTaskUiHarness>>

if (process.argv.includes('--serve') && resolve(process.argv[1] || '') === join(taskUiRoot, 'scripts', 'task-collaboration-ui-fixture.ts')) {
  startTaskUiHarness().then(active => {
    // Credentials stay in the private temporary fixture; never print passwords or cookies.
    console.log(JSON.stringify({ pid: process.pid, baseUrl: active.baseUrl, fixturePath: active.fixturePath, artifacts: active.artifacts }))
    const stop = () => { void active.cleanup().finally(() => process.exit(0)) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }).catch(error => { console.error(error); process.exitCode = 1 })
}
