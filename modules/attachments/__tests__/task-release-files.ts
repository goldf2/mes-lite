import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function main() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mes-task-release-files-'))
  const uploadRoot = path.join(temporaryRoot, 'uploads')
  const databaseUrl = `file:${path.join(temporaryRoot, 'test.db')}`
  process.env.DATABASE_URL = databaseUrl
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot
  try {
    execFileSync(path.join(process.cwd(), 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
    })
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }
  const [{ prisma }, api, command, query, { AttachmentDomainError }] = await Promise.all([
    import('@/lib/prisma'),
    import('../server-index'),
    import('../server/attachment-command-service'),
    import('../server/attachment-query-service'),
    import('../domain/attachment-errors'),
  ])
  const errorStatus = (status: number) => (error: unknown) => error instanceof AttachmentDomainError && error.status === status
  try {
    const admin = await prisma.operator.create({ data: {
      username: 'release-admin', passwordHash: 'synthetic-only', name: '资料测试管理员', role: 'ADMIN', status: 'ACTIVE',
    } })
    const scoped = await prisma.operator.create({ data: {
      username: 'release-scoped', passwordHash: 'synthetic-only', name: '资料范围测试员', role: 'OPERATOR', status: 'ACTIVE',
      dataScope: { create: { productionMode: 'SELF', inventoryMode: 'ALL' } },
      permissionOverrides: { create: [
        { resource: 'taskCollaboration', canRead: true, canUpdate: true, legacyPermanent: true },
        { resource: 'attachments', canRead: true, canCreate: true, legacyPermanent: true },
        { resource: 'workInstructions', canRead: true, legacyPermanent: true },
      ] },
    } })
    const employee = await prisma.employee.create({ data: { code: 'RELEASE-E1', name: '范围员工', operatorId: scoped.id } })
    const unprivileged = await prisma.operator.create({ data: {
      username: 'release-unprivileged', passwordHash: 'synthetic-only', name: '无任务权限测试员', role: 'OPERATOR', status: 'ACTIVE',
    } })
    const task = await prisma.taskCollaboration.create({ data: {
      taskNo: 'TC-FILE-001', title: '发布资料测试任务', quantity: 2, unit: '件', createdBy: admin.id, assigneeEmployeeId: employee.id,
    } })
    const blockedTask = await prisma.taskCollaboration.create({ data: {
      taskNo: 'TC-FILE-002', title: '他人范围任务', quantity: 1, unit: '件', createdBy: admin.id,
    } })
    const category = await prisma.documentCategory.create({ data: { name: '测试图纸' } })
    const instruction = await prisma.workInstruction.create({ data: {
      categoryId: category.id, title: '测试图纸 v3', version: 'v3', contentText: '原始要求',
    } })
    const originalBytes = Buffer.from('drawing-version-3\n测试资料')
    const original = await command.uploadManagedAttachment({
      ownerType: 'WORK_INSTRUCTION', ownerId: instruction.id, documentType: 'ORIGINAL',
      file: new File([originalBytes], 'drawing-v3.txt', { type: 'text/plain' }),
    }, admin.id)
    await command.setManagedAttachmentRotation(original.id, 90)
    const refs = [{ attachmentId: original.id, versionLabel: '图纸 3 版', bomLineId: 'synthetic-line' }]
    await assert.rejects(() => api.inspectTaskReleaseFiles(null, task.id, refs), errorStatus(401))
    await assert.rejects(() => api.inspectTaskReleaseFiles(unprivileged, task.id, refs), errorStatus(403))
    await assert.rejects(() => api.inspectTaskReleaseFiles(scoped, blockedTask.id, refs), errorStatus(404))
    await api.requireManagedAttachmentOwnerAccessForOperator(scoped, 'TASK_COLLABORATION', task.id, 'read')

    const preview = await api.inspectTaskReleaseFiles(scoped, task.id, refs)
    assert.equal(preview[0].attachmentId, original.id)
    assert.equal(preview[0].sourceDocumentVersion, 'v3')
    assert.equal(preview[0].sourceDocumentUpdatedAt, instruction.updatedAt.toISOString())
    assert.equal(preview[0].rotation, 90)
    assert.equal(preview[0].sha256, createHash('sha256').update(originalBytes).digest('hex'))
    assert.equal(await prisma.documentAttachment.count(), 1, '预览不能写附件记录')
    await assert.rejects(() => access(path.join(uploadRoot, 'TASK_COLLABORATION', task.id)), '预览不能创建副本目录')

    await prisma.operatorPermissionOverride.update({
      where: { operatorId_resource: { operatorId: scoped.id, resource: 'workInstructions' } }, data: { canRead: false },
    })
    await assert.rejects(() => api.prepareTaskReleaseFiles(scoped, task.id, refs), errorStatus(403))
    await prisma.operatorPermissionOverride.update({
      where: { operatorId_resource: { operatorId: scoped.id, resource: 'workInstructions' } }, data: { canRead: true },
    })
    const prepared = await api.prepareTaskReleaseFiles(scoped, task.id, refs)
    const frozen = prepared.manifestFiles[0]
    assert.notEqual(frozen.attachmentId, original.id)
    assert.equal(frozen.sourceAttachmentId, original.id)
    assert.equal(frozen.sourceOwnerType, 'WORK_INSTRUCTION')
    assert.equal(frozen.versionLabel, '图纸 3 版')
    assert.equal(frozen.bomLineId, 'synthetic-line')
    assert.equal(await prisma.documentAttachment.count(), 1, 'prepare 不能在发布事务外写数据库')
    assert.deepEqual(await readFile(prepared.attachments[0].storagePath), originalBytes)
    const released = await prisma.$transaction(async (tx) => tx.documentAttachment.create({ data: prepared.attachments[0] }))
    assert.equal((await query.listManagedAttachments('TASK_COLLABORATION', task.id)).length, 0, '发布副本不混进原始附件列表')
    await api.requireManagedAttachmentAccessForOperator(scoped, released.id, 'read')
    await assert.rejects(() => api.requireManagedAttachmentAccessForOperator(admin, released.id, 'update'), errorStatus(409))
    await assert.rejects(() => api.requireManagedAttachmentAccessForOperator(admin, released.id, 'archive'), errorStatus(409))
    await assert.rejects(() => command.setManagedAttachmentRotation(released.id, 180), errorStatus(409))
    await assert.rejects(() => command.regenerateManagedAttachmentPreview(released.id), errorStatus(409))
    await assert.rejects(() => command.archiveManagedAttachment(released.id), errorStatus(409))
    await assert.rejects(() => command.uploadManagedAttachment({
      ownerType: 'TASK_COLLABORATION', ownerId: task.id, documentType: api.TASK_RELEASE_ATTACHMENT_DOCUMENT_TYPE,
      file: new File(['forged release'], 'forged.txt', { type: 'text/plain' }),
    }, admin.id), errorStatus(409))

    await prisma.workInstruction.update({ where: { id: instruction.id }, data: { version: 'v4', contentText: '新的要求' } })
    await command.archiveManagedAttachment(original.id)
    await prisma.workInstruction.update({ where: { id: instruction.id }, data: { deletedAt: new Date() } })
    await api.requireManagedAttachmentAccessForOperator(scoped, released.id, 'read')
    assert.deepEqual(await readFile(released.storagePath), originalBytes, '来源更新和归档不能改变冻结原文件')
    assert.equal(frozen.sourceDocumentVersion, 'v3')
    await assert.rejects(() => api.inspectTaskReleaseFiles(admin, task.id, refs), errorStatus(404))

    await prisma.taskCollaboration.update({ where: { id: task.id }, data: { deletedAt: new Date() } })
    await assert.rejects(() => api.requireManagedAttachmentAccessForOperator(scoped, released.id, 'read'), errorStatus(404))
    await prisma.taskCollaboration.update({ where: { id: task.id }, data: { deletedAt: null } })
    await api.requireManagedAttachmentAccessForOperator(scoped, released.id, 'read')

    const valid = await command.uploadManagedAttachment({
      ownerType: 'TASK_COLLABORATION', ownerId: task.id, documentType: 'ORIGINAL',
      file: new File(['valid source'], 'source.txt', { type: 'text/plain' }),
    }, admin.id)
    const bad = await command.uploadManagedAttachment({
      ownerType: 'TASK_COLLABORATION', ownerId: task.id, documentType: 'ORIGINAL',
      file: new File(['bad source'], 'bad.txt', { type: 'text/plain' }),
    }, admin.id)
    await writeFile(bad.storagePath, 'size does not match the database')
    const ownerDirectory = path.join(uploadRoot, 'TASK_COLLABORATION', task.id)
    const filesBefore = (await readdir(ownerDirectory)).sort()
    await assert.rejects(() => api.prepareTaskReleaseFiles(admin, task.id, [
      { attachmentId: valid.id }, { attachmentId: bad.id },
    ]), errorStatus(409))
    assert.deepEqual((await readdir(ownerDirectory)).sort(), filesBefore, '部分准备失败须清理已创建副本')
    await rm(bad.storagePath)
    await assert.rejects(() => api.prepareTaskReleaseFiles(admin, task.id, [{ attachmentId: bad.id }]), errorStatus(404))
    const rolledBack = await api.prepareTaskReleaseFiles(admin, task.id, [{ attachmentId: valid.id }])
    await rolledBack.cleanup()
    await rolledBack.cleanup()
    await assert.rejects(() => access(rolledBack.attachments[0].storagePath), '事务回滚清理应可重复且保留来源文件')
    await access(valid.storagePath)
    console.log('任务发布附件通过：临时数据库；预览无副作用；权限/范围；真实字节/hash/文档版本；来源更新归档隔离；发布只读；失败/回滚清理。')
  } finally {
    await prisma.$disconnect()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
