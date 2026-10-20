import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PrismaClient } from '@prisma/client'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-task-http-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const uploadDirectory = join(verifyRoot, 'uploads')
const password = `Verify-${randomUUID()}!`
let server: ChildProcess | null = null
let serverLog = ''
let prisma: PrismaClient | null = null
const testEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  PATH: process.env.PATH,
  TMPDIR: process.env.TMPDIR,
  DATABASE_URL: databaseUrl,
  MES_LITE_UPLOAD_DIR: uploadDirectory,
  MES_LITE_LEGACY_UPLOAD_DIR: join(verifyRoot, 'no-legacy-files'),
  NEXT_TELEMETRY_DISABLED: '1',
  APP_LOGIN_MODE: 'builtin',
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

async function waitUntilReady(baseUrl: string, child: ChildProcess) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`本地 Next 验证服务退出：${child.exitCode}`)
    try { if ((await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10_000) })).ok) return } catch { /* wait for local compilation */ }
    await delay(300)
  }
  throw new Error('本地 Next 验证服务启动超时')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const child = server
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    delay(3_000).then(() => { if (child.exitCode === null) child.kill('SIGKILL') }),
  ])
}

async function main() {
  // Next/Prisma automatically load dotenv. Refuse to start if a real dotenv could be read.
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    assert.equal(existsSync(join(root, name)), false, '验证候选目录不得包含真实 dotenv 文件')
  }
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], { cwd: root, env: testEnvironment, stdio: 'pipe' })
  process.env.DATABASE_URL = databaseUrl
  process.env.APP_LOGIN_MODE = 'builtin'
  process.env.MES_LITE_UPLOAD_DIR = uploadDirectory
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const { hashPassword } = await import('../lib/auth')
  const db = prisma
  const [employeeA, employeeB, workCenterA, workCenterB, supplier, material] = await Promise.all([
    db.employee.create({ data: { code: 'TC-HTTP-E-A', name: '合成负责人甲' } }),
    db.employee.create({ data: { code: 'TC-HTTP-E-B', name: '合成负责人乙' } }),
    db.workCenter.create({ data: { code: 'TC-HTTP-W-A', name: '合成工作中心甲' } }),
    db.workCenter.create({ data: { code: 'TC-HTTP-W-B', name: '合成工作中心乙' } }),
    db.supplier.create({ data: { code: 'TC-HTTP-S', name: '合成协作供应商' } }),
    db.material.create({ data: { code: 'TC-HTTP-M', name: '合成任务零件', unit: '件', stockUnit: '件', valuationUnit: 'kg' } }),
  ])
  const fullResources = ['taskCollaboration', 'taskCollaborationPublish', 'materials', 'employees', 'suppliers', 'orders', 'salesOrder', 'dispatch', 'workCenters', 'attachments']
  const fullGroup = await db.permissionGroup.create({ data: {
    code: 'tc-http-full', name: '合成任务全能力测试组', settings: { create: fullResources.map(resource => ({ resource, canRead: true, canCreate: true, canUpdate: true, canDelete: true })) },
  } })
  const taskOnlyGroup = await db.permissionGroup.create({ data: {
    code: 'tc-http-task-only', name: '合成任务无来源读取组', settings: { create: [
      { resource: 'taskCollaboration', canRead: true, canCreate: true, canUpdate: true },
      { resource: 'taskCollaborationPublish', canRead: true, canUpdate: true },
      { resource: 'attachments', canRead: true },
    ] },
  } })
  const noDispatchGroup = await db.permissionGroup.create({ data: {
    code: 'tc-http-no-dispatch', name: '合成缺少派工读取组', settings: { create: fullResources.filter(resource => resource !== 'dispatch').map(resource => ({ resource, canRead: true, canCreate: true, canUpdate: true, canDelete: true })) },
  } })
  const createOperator = (username: string, groupId?: string, employeeId?: string, productionMode: 'ALL' | 'SELF' | 'WORK_CENTERS' = 'ALL', workCenterId?: string) => db.operator.create({ data: {
    username, passwordHash: hashPassword(password), name: username, role: 'OPERATOR', status: 'ACTIVE',
    ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
    dataScope: { create: { productionMode, inventoryMode: 'ALL', ...(workCenterId ? { workCenters: { create: { workCenterId } } } : {}) } },
    ...(groupId ? { permissionGroups: { create: { groupId } } } : {}),
  } })
  const [author, selfReader, outsider, denied, taskOnly, centerReader, noDispatch] = await Promise.all([
    createOperator('tc-http-author', fullGroup.id),
    createOperator('tc-http-self', fullGroup.id, employeeA.id, 'SELF'),
    createOperator('tc-http-outsider', fullGroup.id, employeeB.id, 'SELF'),
    createOperator('tc-http-denied'),
    createOperator('tc-http-task-only', taskOnlyGroup.id),
    createOperator('tc-http-center', fullGroup.id, undefined, 'WORK_CENTERS', workCenterA.id),
    createOperator('tc-http-no-dispatch', noDispatchGroup.id),
  ])
  const product = await db.product.create({ data: { sku: 'TC-HTTP-P', name: '合成生产零件', category: 'FINISHED', unit: '件', materialId: material.id } })
  const route = await db.processRoute.create({ data: { productId: product.id, name: '合成生产路线', isDefault: true,
    steps: { create: [{ stepNo: 10, name: '授权工序', workCenterId: workCenterA.id }, { stepNo: 20, name: '范围外工序', workCenterId: workCenterB.id }] },
  }, include: { steps: { orderBy: { stepNo: 'asc' } } } })
  const otherProduct = await db.product.create({ data: { sku: 'TC-HTTP-P-B', name: '范围外合成产品', category: 'FINISHED', unit: '件' } })
  const otherRoute = await db.processRoute.create({ data: { productId: otherProduct.id, name: '范围外默认路线', isDefault: true,
    steps: { create: [{ stepNo: 10, name: '范围外独立工序', workCenterId: workCenterB.id }] },
  }, include: { steps: true } })
  const [orderA, orderB] = await Promise.all([
    db.productionOrder.create({ data: { orderNo: 'TC-HTTP-PO-A', productId: product.id, materialId: material.id, planQty: 10, completeQty: 3, scrapQty: 1, status: 'IN_PROGRESS' } }),
    db.productionOrder.create({ data: { orderNo: 'TC-HTTP-PO-B', productId: otherProduct.id, materialId: material.id, planQty: 10, completeQty: 7, scrapQty: 2, status: 'IN_PROGRESS' } }),
  ])
  const [dispatchA, dispatchB] = await Promise.all([
    db.dispatch.create({ data: { dispatchNo: 'TC-HTTP-D-A', orderId: orderA.id, stepId: route.steps[0].id, employeeId: employeeA.id, workerName: employeeA.name, planQty: 10, status: 'IN_PROGRESS' } }),
    db.dispatch.create({ data: { dispatchNo: 'TC-HTTP-D-B', orderId: orderB.id, stepId: otherRoute.steps[0].id, employeeId: employeeB.id, workerName: employeeB.name, planQty: 10, status: 'IN_PROGRESS' } }),
  ])

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...testEnvironment, APP_ORIGIN: baseUrl }, stdio: ['ignore', 'pipe', 'pipe'] })
  const collectLog = (chunk: Buffer) => { serverLog = (serverLog + chunk.toString()).slice(-16_000) }
  server.stdout?.on('data', collectLog)
  server.stderr?.on('data', collectLog)
  await waitUntilReady(baseUrl, server)
  const login = async (username: string) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ username, password }) })
    assert.equal(response.status, 200, `合成账号 ${username} 登录失败`)
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie, '合成登录必须生成会话')
    return cookie
  }
  const cookies = new Map<string, string>()
  for (const actor of [author, selfReader, outsider, denied, taskOnly, centerReader, noDispatch]) cookies.set(actor.id, await login(actor.username))
  const request = (path: string, actorId = author.id, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, { ...init, headers: { Cookie: cookies.get(actorId)!, Origin: baseUrl, ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...init.headers } })
  const json = async (response: Response, expected: number) => {
    const body = await response.json()
    assert.equal(response.status, expected, `HTTP ${response.status}: ${JSON.stringify(body)}`)
    return body
  }
  const post = (path: string, body: unknown, actorId = author.id) => request(path, actorId, { method: 'POST', body: JSON.stringify(body) })
  const draft = { title: 'HTTP 合成任务', assigneeEmployeeId: employeeA.id, workCenterId: workCenterA.id, supplierId: supplier.id, quantity: 10, unit: '件', instructions: '按任务资料执行', documentRefs: [],
    lines: [{ materialId: material.id, quantity: 2, unit: '件', note: '图纸 A', documentRefs: [] }],
  }
  const createTask = async (extra: Record<string, unknown> = {}) => (await json(await post('/api/task-collaboration', { ...draft, ...extra }), 201)).data

  assert.equal((await fetch(`${baseUrl}/api/task-collaboration`, { redirect: 'manual' })).status, 401, '未登录必须拒绝')
  assert.equal((await request('/api/task-collaboration', denied.id)).status, 403, '无资源权限必须拒绝')
  assert.equal((await request('/api/task-collaboration/options?type=materials', taskOnly.id)).status, 403, '候选资料必须校验来源资源权限')
  assert.equal((await post('/api/task-collaboration', draft, taskOnly.id)).status, 403, '写入引用必须校验来源资源权限')
  await json(await post('/api/task-collaboration', { ...draft, quantity: 0 }), 400)
  await json(await post('/api/task-collaboration', { ...draft, lines: [{ ...draft.lines[0], unit: '无效单位' }] }), 400)
  await json(await post('/api/task-collaboration', { ...draft, documentRefs: [{ attachmentId: 'missing-synthetic-file' }] }), 404)

  let task = await createTask()
  assert.equal(task.status, 'DRAFT')
  assert.equal(task.execution.source, 'COLLABORATION')
  assert.equal(task.lines[0].material.id, material.id)
  assert.equal((await request(`/api/task-collaboration/${task.id}`, outsider.id)).status, 403, '跨本人范围详情必须拒绝')
  assert.equal((await post(`/api/task-collaboration/${task.id}/assign`, { expectedRevision: task.revision }, outsider.id)).status, 403, '跨本人范围写入必须拒绝')
  assert.equal((await json(await request('/api/task-collaboration', outsider.id), 200)).data.length, 0, '列表不得泄露范围外任务')
  const blockedCenterTask = await createTask({ title: '范围外中心任务', workCenterId: workCenterB.id })
  assert.equal((await request(`/api/task-collaboration/${blockedCenterTask.id}`, centerReader.id)).status, 403, '跨工作中心范围必须拒绝')
  const orderOptions = (await json(await request('/api/task-collaboration/options?type=orders&keyword=TC-HTTP-PO', centerReader.id), 200)).data
  assert.deepEqual(orderOptions.map((row: { id: string }) => row.id), [orderA.id], '关键词不得覆盖工作中心范围的OR条件')
  assert.equal((await post('/api/task-collaboration', { ...draft, assigneeEmployeeId: employeeB.id }, selfReader.id)).status, 403, '本人范围不得为他人创建任务')

  task = (await json(await post(`/api/task-collaboration/${task.id}/assign`, { expectedRevision: task.revision }), 200)).data
  assert.equal(task.status, 'ASSIGNED')
  await json(await request(`/api/task-collaboration/${task.id}`, author.id, { method: 'PATCH', body: JSON.stringify({ ...draft, assigneeEmployeeId: null, supplierId: null, expectedRevision: task.revision }) }), 400)
  const noTarget = await createTask({ title: '无分派对象任务', assigneeEmployeeId: null, supplierId: null })
  await json(await post(`/api/task-collaboration/${noTarget.id}/assign`, { expectedRevision: noTarget.revision }), 400)
  const upload = new FormData()
  upload.set('ownerType', 'TASK_COLLABORATION'); upload.set('ownerId', task.id); upload.set('documentType', 'ORIGINAL')
  upload.set('file', new Blob(['drawing version A\n'], { type: 'text/plain' }), 'synthetic-drawing.txt')
  const attachment = (await json(await request('/api/attachments', author.id, { method: 'POST', body: upload }), 201)).data
  assert.equal((await request(`/api/attachments/${attachment.id}/file`, outsider.id)).status, 404, '任务文件继承任务数据范围')
  const fileOptions = (await json(await request(`/api/task-collaboration/options?type=files&taskId=${task.id}`), 200)).data
  assert.equal(fileOptions[0].id, attachment.id)
  assert.equal(fileOptions.some((row: { storagePath?: string }) => row.storagePath), false, '文件候选不得暴露存储路径')
  const taskInput = { ...draft, documentRefs: [{ attachmentId: attachment.id, versionLabel: 'A' }] }
  task = (await json(await request(`/api/task-collaboration/${task.id}`, author.id, { method: 'PATCH', body: JSON.stringify({ ...taskInput, expectedRevision: task.revision }) }), 200)).data
  await json(await request(`/api/task-collaboration/${task.id}`, author.id, { method: 'PATCH', body: JSON.stringify({ ...taskInput, expectedRevision: task.revision - 1 }) }), 409)
  await json(await post(`/api/task-collaboration/${task.id}/progress`, { kind: 'NOTE', note: '非法数量不能重复维护', completedQuantity: 9 }), 400)
  task = (await json(await post(`/api/task-collaboration/${task.id}/progress`, { kind: 'EXCEPTION', note: '合成异常记录', attachmentRefs: [{ attachmentId: attachment.id }] }), 201)).data
  assert.equal(task.progress.length, 1)
  assert.equal(task.progress[0].actorId, author.id)

  const recipient = { kind: 'EMPLOYEE', id: employeeA.id, name: '前端名称由权威资料覆盖' }
  const preview = (await json(await post(`/api/task-collaboration/${task.id}/release-preview`, { expectedRevision: task.revision, recipient }), 200)).data
  assert.equal(preview.recipient.name, employeeA.name)
  const sourceFile = await db.documentAttachment.findUniqueOrThrow({ where: { id: attachment.id } })
  writeFileSync(sourceFile.storagePath, 'drawing version B\n')
  await json(await post(`/api/task-collaboration/${task.id}/releases`, { expectedRevision: task.revision, recipient, operationId: randomUUID(), previewToken: preview.previewToken }), 409)
  const freshPreview = (await json(await post(`/api/task-collaboration/${task.id}/release-preview`, { expectedRevision: task.revision, recipient }), 200)).data
  const releaseInput = { expectedRevision: task.revision, recipient, operationId: randomUUID(), previewToken: freshPreview.previewToken }
  const release = (await json(await post(`/api/task-collaboration/${task.id}/releases`, releaseInput), 201)).data
  assert.deepEqual(Object.keys(release.manifest.execution).sort(), ['dispatchId', 'productionOrderId', 'source'], '冻结清单只保留MES来源标识，不保存生产实绩数量或实时状态')
  const persistedRelease = await db.taskCollaborationRelease.findUniqueOrThrow({ where: { id: release.id } })
  assert.deepEqual(Object.keys(JSON.parse(persistedRelease.manifestJson).execution).sort(), ['dispatchId', 'productionOrderId', 'source'])
  await db.employee.update({ where: { id: employeeA.id }, data: { name: '合成负责人甲改名' } })
  const repeated = (await json(await post(`/api/task-collaboration/${task.id}/releases`, releaseInput), 201)).data
  assert.equal(release.id, repeated.id, '相同operationId必须返回同一发布，来源主数据改名不破坏幂等')
  await json(await post(`/api/task-collaboration/${task.id}/releases`, { ...releaseInput, operationId: randomUUID() }), 409)
  assert.equal(await db.taskCollaborationRelease.count({ where: { taskId: task.id, revision: task.revision } }), 1)
  const publishedFileId = release.manifest.files[0].attachmentId
  const publishedFile = await db.documentAttachment.findUniqueOrThrow({ where: { id: publishedFileId } })
  assert.equal(readFileSync(publishedFile.storagePath, 'utf8'), 'drawing version B\n')
  writeFileSync(sourceFile.storagePath, 'drawing version C\n')
  assert.equal(await (await request(`/api/attachments/${publishedFileId}/file`)).text(), 'drawing version B\n', '源文件后续修改不能覆盖旧发布字节')
  assert.equal((await request(`/api/attachments?id=${publishedFileId}`, author.id, { method: 'DELETE' })).status, 409, '发布文件不能由普通附件接口归档')
  const deliveryInput = { operationId: randomUUID(), method: 'EXPORT', status: 'EXPORTED', note: '仅合成发放记录' }
  const delivery = (await json(await post(`/api/task-collaboration/${task.id}/releases/${release.id}/deliveries`, deliveryInput), 201)).data
  const deliveryAgain = (await json(await post(`/api/task-collaboration/${task.id}/releases/${release.id}/deliveries`, deliveryInput), 201)).data
  assert.equal(delivery.id, deliveryAgain.id)
  assert.equal(delivery.recipientName, employeeA.name)
  const oldManifest = await json(await request(`/api/task-collaboration/${task.id}/releases/${release.id}/manifest`), 200)
  assert.equal(oldManifest.files[0].sha256, release.manifest.files[0].sha256)

  task = (await json(await post(`/api/task-collaboration/${task.id}/progress`, { kind: 'NOTE', note: '开始协同', status: 'IN_PROGRESS', expectedRevision: task.revision }), 201)).data
  task = (await json(await post(`/api/task-collaboration/${task.id}/progress`, { kind: 'NOTE', note: '协同完成', status: 'COMPLETED', expectedRevision: task.revision }), 201)).data
  await json(await post(`/api/task-collaboration/${task.id}/progress`, { kind: 'NOTE', note: '无效回退', status: 'IN_PROGRESS', expectedRevision: task.revision }), 400)
  assert.equal((await json(await request(`/api/task-collaboration/${task.id}`), 200)).data.releases.length, 1, '任务与历史必须可重新读取')
  const archived = (await json(await post(`/api/task-collaboration/${task.id}/archive`, { expectedRevision: task.revision }), 200)).data
  assert.ok(archived.deletedAt)
  assert.equal((await request(`/api/attachments/${publishedFileId}/file`)).status, 404, '归档任务附件必须不可访问')
  assert.equal((await json(await request('/api/task-collaboration?archived=1'), 200)).data.some((item: { id: string }) => item.id === task.id), true)
  task = (await json(await post(`/api/task-collaboration/${task.id}/restore`, { expectedRevision: archived.revision }), 200)).data
  assert.equal(task.deletedAt, null)
  assert.equal((await request(`/api/attachments/${publishedFileId}/file`)).status, 200)

  let mesTask = await createTask({ title: 'MES实绩只读任务', productionOrderId: orderA.id })
  mesTask = (await json(await post(`/api/task-collaboration/${mesTask.id}/assign`, { expectedRevision: mesTask.revision, dispatchId: dispatchA.id }), 200)).data
  assert.equal(mesTask.execution.source, 'MES')
  assert.equal(mesTask.execution.productionOrder.completeQty, 3)
  await json(await request(`/api/task-collaboration/${mesTask.id}`, author.id, { method: 'PATCH', body: JSON.stringify({ ...draft, productionOrderId: orderB.id, expectedRevision: mesTask.revision }) }), 400)
  await json(await request(`/api/task-collaboration/${mesTask.id}`, noDispatch.id, { method: 'PATCH', body: JSON.stringify({ ...draft, productionOrderId: orderA.id, expectedRevision: mesTask.revision }) }), 403)
  const conflictingEmployee = await createTask({ title: '冲突员工任务', assigneeEmployeeId: employeeB.id, productionOrderId: orderA.id })
  await json(await post(`/api/task-collaboration/${conflictingEmployee.id}/assign`, { expectedRevision: conflictingEmployee.revision, dispatchId: dispatchA.id }), 400)
  const conflictingCenter = await createTask({ title: '冲突工作中心任务', workCenterId: workCenterB.id, productionOrderId: orderA.id })
  await json(await post(`/api/task-collaboration/${conflictingCenter.id}/assign`, { expectedRevision: conflictingCenter.revision, dispatchId: dispatchA.id }), 400)
  await json(await post(`/api/task-collaboration/${mesTask.id}/progress`, { kind: 'NOTE', note: '不允许覆盖MES状态', status: 'COMPLETED', expectedRevision: mesTask.revision }), 400)
  await json(await post(`/api/task-collaboration/${mesTask.id}/progress`, { kind: 'NOTE', note: '仅记录协同备注' }), 201)
  assert.equal((await db.productionOrder.findUniqueOrThrow({ where: { id: orderA.id } })).completeQty, 3)
  assert.equal(await db.productionOrderActual.count(), 0, '协同不得伪造MES实绩')
  const leakTask = await createTask({ title: '关联源范围变化任务', productionOrderId: orderB.id })
  const protectedProjection = (await json(await request(`/api/task-collaboration/${leakTask.id}`, selfReader.id), 200)).data
  assert.equal(protectedProjection.execution.source, 'MES')
  assert.equal(protectedProjection.productionOrder, null, '可见任务不得泄露范围外生产订单')
  assert.equal(protectedProjection.execution.productionOrder, null)
  assert.equal('completeQty' in protectedProjection.execution, false)
  assert.equal((await post(`/api/task-collaboration/${mesTask.id}/assign`, { expectedRevision: mesTask.revision, dispatchId: dispatchB.id })).status, 400)
  const countBefore = await db.material.count()
  const bomCountBefore = await db.bOM.count()
  await createTask({ title: '引用物料不能建立重复主数据' })
  assert.equal(await db.material.count(), countBefore)
  assert.equal(await db.bOM.count(), bomCountBefore)
  assert.ok(await db.auditLog.count({ where: { entityType: 'TASK_COLLABORATION' } }) >= 10)
  console.log('任务协同真实本地 HTTP 回归通过：草稿/BOM/附件→派工→进度→预览/发布/发放→历史/归档恢复；幂等、不可变字节、预览版本冲突、资源权限、SELF/工作中心范围与MES实绩只读均验证。仅临时SQLite、合成账号与测试文件，未连接生产。')
}

main().catch((error) => {
  console.error(error)
  if (serverLog) console.error('本地合成测试服务器日志：\n' + serverLog)
  process.exitCode = 1
}).finally(async () => {
  await stopServer()
  await prisma?.$disconnect()
  rmSync(verifyRoot, { recursive: true, force: true })
})
