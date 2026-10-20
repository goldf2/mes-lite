import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PermissionMap } from '../lib/permissions'

const root = process.cwd()
const temporaryRoot = mkdtempSync(join(tmpdir(), 'mes-task-client-'))
const databaseUrl = `file:${join(temporaryRoot, 'verify.db')}`
const uploadRoot = join(temporaryRoot, 'uploads')
const originalFetch = globalThis.fetch
const previousTimezone = process.env.TZ

async function main() {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    assert.equal(existsSync(join(root, name)), false, '客户端回归候选不得包含真实 dotenv 文件')
  }
  const environment: NodeJS.ProcessEnv = { NODE_ENV: 'development', PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, DATABASE_URL: databaseUrl, APP_LOGIN_MODE: 'builtin', MES_LITE_UPLOAD_DIR: uploadRoot }
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: environment, stdio: 'pipe' })
  process.env.DATABASE_URL = databaseUrl
  process.env.APP_LOGIN_MODE = 'builtin'
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot
  process.env.TZ = 'Asia/Shanghai'

  const [{ prisma }, query, command, release, schemas, identity, client, model] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/task-collaboration/server/task-query-service'),
    import('../modules/task-collaboration/server/task-command-service'),
    import('../modules/task-collaboration/server/task-release-service'),
    import('../modules/task-collaboration/contracts/task-schema'),
    import('../modules/identity-access'),
    import('../modules/task-collaboration/client/task-collaboration-api'),
    import('../modules/task-collaboration/model/task-collaboration-view'),
  ])
  try {
    const admin = await prisma.operator.create({ data: { username: 'tc-client-admin', passwordHash: 'synthetic-no-login', name: '客户端合成管理员', role: 'ADMIN', status: 'ACTIVE' } })
    const [employee, otherEmployee, supplier, workCenter, material, category] = await Promise.all([
      prisma.employee.create({ data: { code: 'TC-CLIENT-E', name: '客户端合成员工甲' } }),
      prisma.employee.create({ data: { code: 'TC-CLIENT-E-OTHER', name: '客户端范围外员工' } }),
      prisma.supplier.create({ data: { code: 'TC-CLIENT-S', name: '客户端合成供应商' } }),
      prisma.workCenter.create({ data: { code: 'TC-CLIENT-W', name: '客户端合成工作中心' } }),
      prisma.material.create({ data: { code: 'TC-CLIENT-M', name: '客户端合成零件', spec: 'M8×20', unit: '件', stockUnit: '件', valuationUnit: 'kg' } }),
      prisma.documentCategory.create({ data: { name: '客户端合成图纸分类' } }),
    ])
    const scopedOperator = await prisma.operator.create({ data: {
      username: 'tc-client-self', passwordHash: 'synthetic-no-login', name: '客户端本人范围账号', role: 'OPERATOR', status: 'ACTIVE', employee: { connect: { id: employee.id } },
      dataScope: { create: { productionMode: 'SELF', inventoryMode: 'ALL' } },
      permissionOverrides: { create: [
        { resource: 'taskCollaboration', canRead: true, legacyPermanent: true },
        { resource: 'attachments', canRead: true, legacyPermanent: true },
        { resource: 'workInstructions', canRead: false, legacyPermanent: true },
      ] },
    } })
    const scope = { ...identity.unrestrictedDataScope, operatorId: admin.id }
    const selfScope = await identity.loadEffectiveDataScope(scopedOperator)
    const audit = { operatorId: admin.id, operatorName: admin.name }
    const instruction = await prisma.workInstruction.create({ data: { categoryId: category.id, title: '合成受控图纸', version: 'R3', contentText: '仅合成资料' } })
    mkdirSync(uploadRoot, { recursive: true })
    const sourceFiles = await Promise.all([
      ['source-a.dwg', 'image/vnd.dwg', 'synthetic-dwg-content'],
      ['source-b.pdf', 'application/pdf', '%PDF-synthetic-content'],
    ].map(async ([originalName, mimeType, text]) => {
      const storagePath = join(uploadRoot, originalName)
      writeFileSync(storagePath, text)
      return prisma.documentAttachment.create({ data: {
        ownerType: 'WORK_INSTRUCTION', ownerId: instruction.id, documentType: 'ORIGINAL', originalName,
        fileName: originalName, mimeType, size: Buffer.byteLength(text), url: '/unused-synthetic-storage-url', storagePath, rotation: 90,
      } })
    }))
    const product = await prisma.product.create({ data: { sku: 'TC-CLIENT-P', name: '合成生产产品', category: 'FINISHED', unit: '件', materialId: material.id } })
    const route = await prisma.processRoute.create({ data: { productId: product.id, name: '合成路线', isDefault: true, steps: { create: { stepNo: 10, name: '合成工序', workCenterId: workCenter.id } } }, include: { steps: true } })
    const order = await prisma.productionOrder.create({ data: { orderNo: 'TC-CLIENT-PO', productId: product.id, materialId: material.id, status: 'IN_PROGRESS', planQty: 10, completeQty: 7, scrapQty: 2 } })
    await prisma.dispatch.create({ data: { dispatchNo: 'TC-CLIENT-DP-OTHER', orderId: order.id, stepId: route.steps[0].id, employeeId: otherEmployee.id, workerName: otherEmployee.name, status: 'IN_PROGRESS', planQty: 10 } })

    const baseInput = schemas.taskDraftSchema.parse({
      title: '真实服务原始DTO客户端回归', assigneeEmployeeId: employee.id, supplierId: supplier.id, workCenterId: workCenter.id,
      productionOrderId: order.id, quantity: 10, unit: '件', dueAt: '2026-10-22T01:30:00.000Z', instructions: '保留固定加工要求',
      documentRefs: [{ attachmentId: sourceFiles[0].id, versionLabel: 'R3' }],
      lines: [{ materialId: material.id, quantity: 2, unit: '件', note: '保留两个文件引用', documentRefs: sourceFiles.map(file => ({ attachmentId: file.id, versionLabel: 'R3' })) }],
    })
    const raw = await command.createTask(baseInput, admin, scope, audit)
    assert.equal(raw.assigneeEmployee?.name, employee.name, 'fixture必须使用真实服务的嵌套员工资料')
    assert.equal(raw.lines[0].material.code, material.code)
    assert.equal(raw.documentRefs[0].mimeType, sourceFiles[0].mimeType)
    const restrictedRaw = await query.getTask(raw.id, selfScope)
    assert.equal(restrictedRaw.execution.productionOrder, null, 'fixture必须由真实范围过滤产生null实绩')
    assert.equal(restrictedRaw.execution.status, null)
    assert.equal(restrictedRaw.documentRefs[0].fileUnavailable, true, 'fixture必须由真实来源权限校验产生不可访问文件')
    assert.equal(restrictedRaw.documentRefs[0].mimeType, undefined)

    // Keep the browser's public HTTP client unchanged. Only transport is replaced:
    // every success payload comes from the same production services as the routes.
    let activeScope = scope
    const calls: Array<{ path: string; method: string }> = []
    globalThis.fetch = (async (resource: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof resource === 'string' || resource instanceof URL ? String(resource) : resource.url, 'http://synthetic.local')
      const method = init?.method || 'GET'
      calls.push({ path: url.pathname, method })
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
      const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
      try {
        const segments = url.pathname.split('/').filter(Boolean)
        assert.equal(segments.slice(0, 2).join('/'), 'api/task-collaboration', '客户端不得请求契约之外的网络')
        const id = segments[2]
        const action = segments[3]
        if (!id && method === 'GET') {
          const result = await query.listTasks({ keyword: url.searchParams.get('keyword') || undefined, archived: url.searchParams.get('archived') === '1', page: Number(url.searchParams.get('page') || 1), pageSize: Number(url.searchParams.get('pageSize') || 20) }, activeScope)
          return respond({ data: result.items, pagination: result.pagination })
        }
        if (!id && method === 'POST') {
          const input = schemas.createTaskSchema.parse(body)
          const inherit = { lines: !Object.prototype.hasOwnProperty.call(body, 'lines'), documentRefs: !Object.prototype.hasOwnProperty.call(body, 'documentRefs'), instructions: !Object.prototype.hasOwnProperty.call(body, 'instructions') }
          return respond({ data: await command.createTask(input, admin, activeScope, audit, inherit) }, 201)
        }
        if (id && !action && method === 'GET') return respond({ data: await query.getTask(id, activeScope) })
        if (id && !action && method === 'PATCH') return respond({ data: await command.updateTask(id, schemas.updateTaskSchema.parse(body), admin, activeScope, audit) })
        if (action === 'assign') return respond({ data: await command.assignTask(id, schemas.assignTaskSchema.parse(body), admin, activeScope, audit) })
        if (action === 'progress') return respond({ data: await command.appendTaskProgress(id, schemas.progressSchema.parse(body), admin, activeScope, audit) }, 201)
        if (action === 'release-preview') return respond({ data: await release.previewTaskRelease(id, schemas.previewReleaseSchema.parse(body), admin, activeScope) })
        if (action === 'releases' && !segments[4]) return respond({ data: await release.publishTaskRelease(id, schemas.releaseTaskSchema.parse(body), admin, activeScope, audit) }, 201)
        if (action === 'releases' && segments[5] === 'manifest') return respond((await release.getTaskRelease(id, segments[4], activeScope)).manifest)
        if (action === 'archive' || action === 'restore') return respond({ data: await command.archiveOrRestoreTask(id, schemas.revisionSchema.parse(body).expectedRevision, action === 'restore', admin, activeScope, audit) })
        throw new Error(`未实现的客户端调用 ${method} ${url.pathname}`)
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error) {
          const domain = error as Error & { status: number; code?: string }
          return respond({ error: domain.message, code: domain.code || (domain.status === 403 ? 'SCOPE_DENIED' : 'INVALID_REFERENCE') }, domain.status)
        }
        if (error instanceof Error && error.name === 'ZodError') return respond({ error: '参数错误', code: 'VALIDATION_ERROR' }, 400)
        throw error
      }
    }) as typeof fetch

    const failures: string[] = []
    let checkCount = 0
    const recordCheck = (message: string, run: () => void) => {
      checkCount += 1
      try { run() } catch (error) { failures.push(`${message}: ${error instanceof Error ? error.message : String(error)}`) }
    }
    // Continue independent contract assertions so one UI defect does not hide
    // unrelated DTO, file, permission or date failures in the same run.
    const check = {
      equal: (actual: unknown, expected: unknown, message = '客户端值一致') => recordCheck(message, () => assert.equal(actual, expected)),
      notEqual: (actual: unknown, expected: unknown, message = '客户端标识独立') => recordCheck(message, () => assert.notEqual(actual, expected)),
      deepEqual: (actual: unknown, expected: unknown, message = '客户端结构一致') => recordCheck(message, () => assert.deepEqual(actual, expected)),
      match: (actual: string, expected: RegExp, message = '客户端字段格式') => recordCheck(message, () => assert.match(actual, expected)),
      ok: (value: unknown, message = '客户端条件成立') => recordCheck(message, () => assert.ok(value)),
      rejects: async (run: () => Promise<unknown>, validate: (error: unknown) => boolean) => {
        checkCount += 1
        try { await assert.rejects(run, validate) } catch (error) { failures.push(`客户端错误映射: ${error instanceof Error ? error.message : String(error)}`) }
      },
    }
    const assertNormalized = (task: Awaited<ReturnType<typeof client.getTaskDetail>>) => {
      check.equal(task.assigneeEmployeeName, employee.name, '客户端必须将真实嵌套员工资料转换为界面字段')
      check.equal(task.supplierName, supplier.name)
      check.equal(task.workCenterName, workCenter.name)
      check.equal(task.lines[0].materialCode, material.code)
      check.equal(task.lines[0].materialName, material.name)
      check.equal(task.lines[0].documentRefs.length, 2, 'DTO往返不能删除第二份图纸')
      check.equal(task.documentRefs[0].mimeType, sourceFiles[0].mimeType)
      check.match(task.documentRefs[0].previewUrl || '', new RegExp(`/api/attachments/${sourceFiles[0].id}/preview`), 'CAD必须使用受控派生预览URL')
    }
    const detail = await client.getTaskDetail(raw.id)
    assertNormalized(detail)
    const listed = await client.listTasks({ page: 1, pageSize: 20 })
    assertNormalized(listed.data.find(task => task.id === raw.id)!)
    const created = await client.createTaskDraft({ ...baseInput, title: '客户端真实新增归一' })
    assertNormalized(created)
    const editable = model.draftFromTaskRecord(created)
    const updated = await client.updateTaskDraft(created.id, { ...editable, title: '客户端真实更新归一', expectedRevision: created.revision })
    assertNormalized(updated)
    const assigned = await client.assignTask(created.id, { expectedRevision: updated.revision })
    assertNormalized(assigned)
    const noted = await client.appendTaskProgress(created.id, { kind: 'NOTE', note: '客户端进度返回值也须统一归一', attachmentRefs: [{ attachmentId: sourceFiles[0].id, versionLabel: 'R3' }] })
    assertNormalized(noted)
    check.equal(noted.progress[0].attachmentRefs[0].mimeType, sourceFiles[0].mimeType)
    const preview = await client.previewTaskRelease(created.id, { expectedRevision: assigned.revision, recipient: { kind: 'EMPLOYEE', id: employee.id, name: employee.name } })
    check.equal(preview.task.lines[0].materialCode, material.code, '发布预览必须归一真实快照的嵌套物料')
    check.equal(preview.task.lines[0].materialName, material.name)
    check.match(preview.previewToken, /^[a-f0-9]{64}$/)
    const published = await client.publishTaskRelease(created.id, { expectedRevision: assigned.revision, recipient: preview.recipient, previewToken: preview.previewToken, operationId: client.createOperationId() })
    const copiedCad = published.manifest.files.find(file => file.sourceAttachmentId === sourceFiles[0].id)!
    check.notEqual(copiedCad.attachmentId, sourceFiles[0].id, '发布文件必须指向副本而非源附件')
    check.match(copiedCad.previewUrl || '', new RegExp(`/api/attachments/${copiedCad.attachmentId}/preview`), '发布副本CAD预览URL必须使用副本ID')
    const manifest = await client.downloadTaskReleaseManifest(created.id, published.id)
    check.equal(manifest.task.lines[0].materialCode, material.code)
    check.equal(manifest.files[0].attachmentId, published.manifest.files[0].attachmentId)
    const archived = await client.archiveTask(created.id, assigned.revision)
    check.equal(archived.assigneeEmployeeName, employee.name)
    check.equal(archived.lines[0].materialCode, material.code)
    const restored = await client.restoreTask(created.id, archived.revision)
    assertNormalized(restored)

    activeScope = selfScope
    const restricted = await client.getTaskDetail(raw.id)
    check.equal(restricted.execution.productionOrder, null)
    check.equal(restricted.execution.dispatch, null)
    check.equal(restricted.execution.status, null, '范围外MES不能被客户端默认成可维护的协同状态')
    const unavailable = restricted.documentRefs[0] as typeof restricted.documentRefs[number] & { fileUnavailable?: boolean }
    check.equal(unavailable.fileUnavailable, true)
    check.ok(unavailable.mimeType == null, '无来源权限文件不得被客户端猜成PDF')
    check.ok(!unavailable.previewUrl, '无来源权限文件不得生成可点击预览链接')
    activeScope = scope

    const templateInput = model.draftFromTaskRecord(detail, true)
    const fromTemplate = await client.createTaskDraft({ ...templateInput, title: '客户端模板执行信息独立', assigneeEmployeeId: employee.id, supplierId: supplier.id })
    check.equal(fromTemplate.productionOrderId, null)
    check.equal(fromTemplate.dispatchId, null)
    check.equal(fromTemplate.execution.source, 'COLLABORATION')
    check.equal(fromTemplate.progress.length, 0)
    check.equal(fromTemplate.releases.length, 0)
    check.notEqual(fromTemplate.lines[0].id, detail.lines[0].id)
    check.equal(fromTemplate.lines[0].documentRefs.length, 2)
    check.equal(fromTemplate.instructions, detail.instructions)
    await check.rejects(() => client.getTaskDetail('not-a-synthetic-task'), error => error instanceof client.TaskCollaborationApiError && error.status === 404 && error.code === 'NOT_FOUND')

    const denied = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }
    const actualPermissionMap: PermissionMap = { taskCollaboration: { ...denied, canRead: true }, taskCollaborationPublish: denied }
    const permitted = model.resolveTaskPermissions(actualPermissionMap)
    check.deepEqual([permitted.canRead, permitted.canCreate, permitted.canUpdate, permitted.canPublish], [true, false, false, false], '权限解析必须使用真实MES canRead/canCreate flags')
    check.equal(Object.values(model.resolveTaskPermissions({})).some(Boolean), false, '缺失资源权限必须拒绝')
    check.equal(Object.values(model.resolveTaskPermissions(undefined)).some(Boolean), false, '权限尚未载入不能默认允许')
    const withoutAttachmentResource = model.resolveTaskPermissions({
      taskCollaboration: { canRead: true, canCreate: true, canUpdate: true, canDelete: true, canGrant: false },
    }) as ReturnType<typeof model.resolveTaskPermissions> & {
      canReadAttachments?: boolean; canUploadAttachments?: boolean; canUpdateAttachments?: boolean; canDeleteAttachments?: boolean
    }
    check.deepEqual([
      withoutAttachmentResource.canReadAttachments, withoutAttachmentResource.canUploadAttachments,
      withoutAttachmentResource.canUpdateAttachments, withoutAttachmentResource.canDeleteAttachments,
    ], [false, false, false, false], '拥有任务权限不能代替缺失的独立附件权限')
    const withoutAttachmentCreate = model.resolveTaskPermissions({
      taskCollaboration: { ...denied, canRead: true, canUpdate: true },
      attachments: { ...denied, canRead: true, canUpdate: true },
    }) as typeof withoutAttachmentResource
    check.equal(withoutAttachmentCreate.canUploadAttachments, false, '附件update权限不能代替上传所需的独立create权限')
    const attachmentReadWithTaskUpdate = model.resolveTaskPermissions({
      taskCollaboration: { ...denied, canRead: true, canUpdate: true },
      attachments: { ...denied, canRead: true },
    }) as typeof withoutAttachmentResource
    check.equal(attachmentReadWithTaskUpdate.canUpdateAttachments, true, '现有文件旋转权限应与服务端attachments.read加task.update对齐')

    const dates = model as typeof model & {
      formatIsoToLocalDateTimeInput?: (iso?: string | null) => string
      localDateTimeInputToIso?: (value?: string | null) => string | null
    }
    if (dates.formatIsoToLocalDateTimeInput && dates.localDateTimeInputToIso) {
      const original = '2026-10-22T01:30:00.000Z'
      const localInput = dates.formatIsoToLocalDateTimeInput(original)
      check.equal(localInput, '2026-10-22T09:30')
      check.equal(dates.localDateTimeInputToIso(localInput), original, '交期UTC→本地输入→UTC必须保持同一时刻')
    } else {
      console.log('日期纯函数尚未公开；datetime-local往返留给真实界面验收。')
    }
    check.ok(calls.some(call => call.method === 'PATCH'))
    console.log(`客户端契约检查：${checkCount - failures.length}/${checkCount} 条通过；真实服务DTO、文件元数据/副本、范围、模板、权限与日期场景均已执行。`)
    if (failures.length) throw new Error(`客户端契约回归发现 ${failures.length} 个断言失败：\n${failures.join('\n')}`)
    console.log('任务协同客户端契约回归通过：真实服务嵌套DTO经list/detail/create/update/assign/progress/preview/publish/manifest/archive/restore归一；文件元数据/副本ID/范围null/真实权限/模板独立性验证通过。传输仅用fake fetch，业务数据来自临时SQLite和合成文件。')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  globalThis.fetch = originalFetch
  if (previousTimezone === undefined) delete process.env.TZ
  else process.env.TZ = previousTimezone
  rmSync(temporaryRoot, { recursive: true, force: true })
})
