import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function main() {
  const root = process.cwd()
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    assert.equal(existsSync(path.join(root, name)), false, '候选验证不得加载真实 dotenv')
  }
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mes-task-file-references-'))
  process.env.DATABASE_URL = `file:${path.join(temporaryRoot, 'test.db')}`
  process.env.MES_LITE_UPLOAD_DIR = path.join(temporaryRoot, 'uploads')
  try {
    execFileSync(path.join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: root, env: { ...process.env, RUST_LOG: 'info' }, stdio: 'pipe',
    })
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }
  const [{ prisma }, { loadEffectiveDataScope }, { hydrateTaskFileReferenceGroups }, { uploadManagedAttachment }, { getTask }, { previewTaskRelease }] = await Promise.all([
    import('@/lib/prisma'),
    import('@/modules/identity-access'),
    import('../modules/task-collaboration/server/task-file-reference-service'),
    import('@/modules/attachments/server/attachment-command-service'),
    import('../modules/task-collaboration/server/task-query-service'),
    import('../modules/task-collaboration/server/task-release-service'),
  ])
  try {
    let attachmentLookups = 0
    let operatorLookups = 0
    prisma.$use(async (params, next) => {
      if (params.model === 'DocumentAttachment' && params.action === 'findUnique') attachmentLookups += 1
      if (params.model === 'Operator' && params.action === 'findFirst') operatorLookups += 1
      return next(params)
    })
    const admin = await prisma.operator.create({ data: {
      username: 'file-meta-admin', passwordHash: 'synthetic-only', name: '元数据测试管理员', role: 'ADMIN', status: 'ACTIVE',
    } })
    const actor = await prisma.operator.create({ data: {
      username: 'file-meta-self', passwordHash: 'synthetic-only', name: '本人范围测试员', role: 'OPERATOR', status: 'ACTIVE',
      dataScope: { create: { productionMode: 'SELF', inventoryMode: 'ALL' } },
      permissionOverrides: { create: [
        { resource: 'taskCollaboration', canRead: true, legacyPermanent: true },
        { resource: 'attachments', canRead: true, legacyPermanent: true },
        { resource: 'workInstructions', canRead: true, legacyPermanent: true },
        { resource: 'employees', canRead: true, legacyPermanent: true },
      ] },
    } })
    const employee = await prisma.employee.create({ data: { code: 'FM-EMP-1', name: '测试负责人', operatorId: actor.id } })
    const scope = await loadEffectiveDataScope(actor)
    assert.deepEqual(await hydrateTaskFileReferenceGroups(scope, [[], []]), [[], []])
    assert.equal(operatorLookups, 0, '空引用不得查询操作账号')

    const category = await prisma.documentCategory.create({ data: { name: '元数据测试图纸' } })
    const instruction = await prisma.workInstruction.create({ data: { title: '精确类型图纸', version: 'v3', categoryId: category.id } })
    const source = await uploadManagedAttachment({
      ownerType: 'WORK_INSTRUCTION', ownerId: instruction.id, documentType: 'ORIGINAL',
      file: new File(['synthetic-dwg-bytes'], 'source-v3.dwg', { type: 'application/vnd.dwg' }),
    }, admin.id)
    await prisma.documentAttachment.update({ where: { id: source.id }, data: { rotation: 90, previewRevision: 4 } })
    const duplicateGroups = await hydrateTaskFileReferenceGroups(scope, [
      [{ attachmentId: source.id, versionLabel: '图纸 3 版' }],
      [{ attachmentId: source.id, versionLabel: '同源 BOM 图纸' }],
    ])
    assert.equal(attachmentLookups, 1, '同一响应的重复来源应共享鉴权和元数据缓存')
    assert.equal(operatorLookups, 1, '非空批量引用只加载一次当前操作账号')
    const visible = duplicateGroups[0][0]
    assert.equal(visible.originalName, 'source-v3.dwg')
    assert.equal(visible.mimeType, 'application/vnd.dwg')
    assert.equal(visible.previewKind, 'cad')
    assert.equal(visible.size, source.size)
    assert.equal(visible.rotation, 90)
    assert.equal(visible.previewRevision, 4)
    assert.equal(visible.previewUrl, `/api/attachments/${source.id}/preview?v=4`)
    assert.equal(visible.url, `/api/attachments/${source.id}/file`)
    assert.equal(visible.originalUrl, `/api/attachments/${source.id}/file`)
    assert.equal(visible.thumbnailUrl, `/api/attachments/${source.id}/thumbnail?v=4-90`)
    assert.equal('storagePath' in visible, false)
    assert.equal('ownerId' in visible, false)
    assert.equal(visible.fileUnavailable, false)
    assert.equal(duplicateGroups[1][0].versionLabel, '同源 BOM 图纸')

    const blockedTask = await prisma.taskCollaboration.create({ data: {
      taskNo: 'TC-META-BLOCKED', title: '他人范围任务', quantity: 1, unit: '件', createdBy: admin.id,
    } })
    const blocked = await uploadManagedAttachment({
      ownerType: 'TASK_COLLABORATION', ownerId: blockedTask.id, documentType: 'ORIGINAL',
      file: new File(['blocked-source'], 'confidential-source.txt', { type: 'text/plain' }),
    }, admin.id)
    const hidden = (await hydrateTaskFileReferenceGroups({ ...scope, productionMode: 'ALL' }, [[
      { attachmentId: blocked.id, versionLabel: '引用本身保留', originalName: 'forged-name', url: '/uploads/unsafe' },
      { attachmentId: 'missing-file', versionLabel: '失效资料' },
    ]]))[0]
    assert.deepEqual(hidden, [
      { attachmentId: blocked.id, versionLabel: '引用本身保留', fileUnavailable: true },
      { attachmentId: 'missing-file', versionLabel: '失效资料', fileUnavailable: true },
    ], '来源范围必须用真实账号重新校验；拒绝时不得泄露名称、类型、大小或路径')

    await prisma.operatorPermissionOverride.update({
      where: { operatorId_resource: { operatorId: actor.id, resource: 'workInstructions' } }, data: { canRead: false },
    })
    assert.deepEqual((await hydrateTaskFileReferenceGroups(scope, [[{ attachmentId: source.id }]]))[0][0], { attachmentId: source.id, fileUnavailable: true })
    await prisma.operatorPermissionOverride.update({
      where: { operatorId_resource: { operatorId: actor.id, resource: 'workInstructions' } }, data: { canRead: true },
    })

    const material = await prisma.material.create({ data: { code: 'FM-MAT', name: '元数据合成物料', unit: '件' } })
    const rawRef = JSON.stringify([{ attachmentId: source.id, versionLabel: '已授权资料' }])
    const task = await prisma.taskCollaboration.create({ data: {
      taskNo: 'TC-META-VISIBLE', title: '全部引用层次测试', assigneeEmployeeId: employee.id, quantity: 1, unit: '件', createdBy: admin.id,
      documentRefsJson: rawRef,
      lines: { create: { materialId: material.id, quantity: 1, unit: '件', documentRefsJson: rawRef } },
      progress: { create: { kind: 'NOTE', note: '进度引用合成资料', actorId: actor.id, actorName: actor.name, attachmentRefsJson: rawRef } },
    } })
    const lookupsBeforeGet = attachmentLookups
    const hydratedTask = await getTask(task.id, scope)
    assert.equal(attachmentLookups - lookupsBeforeGet, 1, '任务、BOM和进度重复引用共用一个读取缓存')
    for (const ref of [hydratedTask.documentRefs[0], hydratedTask.lines[0].documentRefs[0], hydratedTask.progress[0].attachmentRefs[0]]) {
      assert.equal(ref.originalName, source.originalName)
      assert.equal(ref.previewKind, 'cad')
      assert.equal(ref.fileUnavailable, false)
    }

    await prisma.taskCollaboration.update({ where: { id: task.id }, data: { status: 'ASSIGNED' } })
    const previewInput = { expectedRevision: 1, recipient: { kind: 'EMPLOYEE' as const, id: employee.id, name: employee.name } }
    const initialPreview = await previewTaskRelease(task.id, previewInput, actor, scope)
    await prisma.documentAttachment.update({ where: { id: source.id }, data: { previewRevision: 5 } })
    const urlChangedTask = await getTask(task.id, scope)
    assert.equal(urlChangedTask.documentRefs[0].previewUrl, `/api/attachments/${source.id}/preview?v=5`)
    const changedUrlPreview = await previewTaskRelease(task.id, previewInput, actor, scope)
    assert.equal(changedUrlPreview.previewToken, initialPreview.previewToken, '展示URL和预览修订号不得污染发布决策token')
    assert.deepEqual(changedUrlPreview.task.documentRefs, [{ attachmentId: source.id, versionLabel: '已授权资料' }])
    await prisma.workInstruction.update({ where: { id: instruction.id }, data: { version: 'v4' } })
    const changedVersionPreview = await previewTaskRelease(task.id, previewInput, actor, scope)
    assert.notEqual(changedVersionPreview.previewToken, initialPreview.previewToken, '真实来源文档版本变化必须改变发布token')
    const changedBytes = Buffer.from('synthetic-dwg-bytes')
    changedBytes[0] = 'X'.charCodeAt(0)
    await writeFile(source.storagePath, changedBytes)
    const changedBytesPreview = await previewTaskRelease(task.id, previewInput, actor, scope)
    assert.notEqual(changedBytesPreview.previewToken, changedVersionPreview.previewToken, '来源字节变化必须改变发布token')

    await prisma.operatorPermissionOverride.update({
      where: { operatorId_resource: { operatorId: actor.id, resource: 'attachments' } }, data: { canRead: false },
    })
    assert.deepEqual((await getTask(task.id, scope)).documentRefs[0], { attachmentId: source.id, versionLabel: '已授权资料', fileUnavailable: true })
    await prisma.operatorPermissionOverride.update({
      where: { operatorId_resource: { operatorId: actor.id, resource: 'attachments' } }, data: { canRead: true },
    })
    await prisma.documentAttachment.update({ where: { id: source.id }, data: { deletedAt: new Date() } })
    assert.deepEqual((await getTask(task.id, scope)).lines[0].documentRefs[0], { attachmentId: source.id, versionLabel: '已授权资料', fileUnavailable: true })
    await prisma.operator.update({ where: { id: actor.id }, data: { status: 'PENDING' } })
    assert.equal((await hydrateTaskFileReferenceGroups(scope, [[{ attachmentId: blocked.id }]]))[0][0].fileUnavailable, true)
    console.log('任务文件引用元数据通过：临时数据库；精确CAD MIME/受控URLs；资源与附件权限；来源数据范围；失效隐藏；任务/BOM/进度缓存；空引用零查询；展示URL不污染token，真实文档版本与字节变化改变token。')
  } finally {
    await prisma.$disconnect()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
