import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const attachmentPanelSource = readFileSync(join(root, 'modules/attachments/ui/AttachmentPanel.tsx'), 'utf8')
const productionModuleSource = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')
const salesOrderSource = readFileSync(join(root, 'modules/sales/ui/SalesOrderPageModule.tsx'), 'utf8')
const detailDialogSource = readFileSync(join(root, 'modules/business-documents/ui/BusinessDocumentDetailDialog.tsx'), 'utf8')
const attachmentClientSource = readFileSync(join(root, 'modules/attachments/client/attachment-api.ts'), 'utf8')
const attachmentAuthorizationSource = readFileSync(join(root, 'modules/attachments/server/attachment-authorization-service.ts'), 'utf8')
const attachmentPolicySource = readFileSync(join(root, 'modules/attachments/domain/attachment-policy.ts'), 'utf8')
const middlewareSource = readFileSync(join(root, 'middleware.ts'), 'utf8')
const attachmentRoutePaths = [
  'app/api/attachments/route.ts',
  'app/api/attachments/drafts/route.ts',
  'app/api/attachments/[id]/file/route.ts',
  'app/api/attachments/[id]/preview/route.ts',
  'app/api/attachments/[id]/thumbnail/route.ts',
  'app/api/attachments/[id]/image/[variant]/route.ts',
] as const
const detailManagedPages = [
  ['来料', 'modules/receiving/ui/MaterialInCollectionView.tsx', 'modules/receiving/ui/MaterialInDetailDialog.tsx'],
  ['派工', 'modules/production/ui/DispatchPageModule.tsx', 'modules/production/ui/DispatchPageModule.tsx'],
  ['发货', 'modules/sales/ui/ShipmentPageModule.tsx', 'modules/sales/ui/ShipmentPageModule.tsx'],
  ['退货', 'modules/sales/ui/ReturnPageModule.tsx', 'modules/sales/ui/ReturnDetailDialog.tsx'],
] as const

assert.match(attachmentPanelSource, /title\s*=\s*'附件管理'/, '公共附件模块默认名称必须为附件管理')
assert.match(attachmentPanelSource, /compactMode\?:\s*'manage'\s*\|\s*'summary'/, '附件模块必须提供列表摘要模式')
assert.match(attachmentPanelSource, /DocumentPreviewThumb/, '附件管理必须复用公共缩略图组件')
assert.match(attachmentPanelSource, /DocumentFileViewer/, '附件管理必须复用公共文档查看器')
assert.match(attachmentPanelSource, /AI 识别并填充/, '附件管理必须保留 AI 识别并填充入口')
assert.match(attachmentPanelSource, /handleAiRecognition\(attachment\)/, '多个附件必须可以分别选择后进入 AI 识别流程')
assert.match(attachmentPanelSource, /onAiRecognize\?:\s*\(attachment:\s*ManagedAttachment\)/, 'AI 识别入口必须暴露基于附件的回调契约')
assert.match(attachmentPanelSource, /from '\.\.\/client\/attachment-api'/, '附件面板必须通过所属模块客户端访问 API')
assert.doesNotMatch(attachmentPanelSource, /fetch\(['"]\/api\/attachments/, '公共附件面板不得重复实现附件请求')
assert.match(attachmentClientSource, /export async function listAttachments/, '附件模块必须提供统一客户端契约')
for (const modulePath of [
  'modules/attachments/contracts/attachment-schema.ts',
  'modules/attachments/domain/attachment-errors.ts',
  'modules/attachments/domain/attachment-policy.ts',
  'modules/attachments/server/attachment-query-service.ts',
  'modules/attachments/server/attachment-command-service.ts',
  'modules/attachments/server/attachment-authorization-service.ts',
  'modules/attachments/client/attachment-api.ts',
  'modules/attachments/index.ts',
]) {
  assert.ok(readFileSync(join(root, modulePath), 'utf8').length > 0, `附件模块缺少 ${modulePath}`)
}
for (const routePath of attachmentRoutePaths) {
  const source = readFileSync(join(root, routePath), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|prisma\.|\$transaction/, `${routePath} 必须保持为薄 HTTP 层`)
  assert.match(source, /requireManagedAttachment(?:Owner)?Access/, `${routePath} 必须校验附件所属业务对象权限`)
}
assert.match(attachmentAuthorizationSource, /hasResourcePermission/, '附件鉴权必须同时复用统一资源权限')
assert.match(attachmentAuthorizationSource, /attachmentOwnerExists/, '附件鉴权必须验证所属业务对象真实存在')
assert.match(attachmentAuthorizationSource, /loadEffectiveDataScope/, '附件鉴权必须校验所属业务对象的数据范围')
assert.match(attachmentAuthorizationSource, /uploadedBy !== operator\.id/, '暂存附件必须限制为当前登录人员所有')
assert.match(attachmentPolicySource, /EQUIPMENT_INSPECTION_RECORD: \{ resource: 'equipmentInspections' \}/, '点检附件必须继承点检资源')
assert.match(attachmentAuthorizationSource, /equipmentInspectionRecord\.findFirst/, '点检附件必须校验记录和工作中心数据范围')
assert.match(attachmentPolicySource, /EQUIPMENT_MAINTENANCE_WORK_ORDER: \{ resource: 'equipmentMaintenance' \}/, '维保附件必须继承设备维保资源')
assert.match(attachmentAuthorizationSource, /equipmentMaintenanceWorkOrder\.findFirst/, '维保附件必须校验工单和工作中心数据范围')
assert.match(attachmentPolicySource, /QUALITY_INSPECTION: \{ resource: 'quality' \}/, '质量检验附件必须继承质量任务资源')
assert.match(attachmentAuthorizationSource, /qualityInspection\.findFirst/, '质量检验附件必须校验检验任务和库位数据范围')
assert.match(attachmentAuthorizationSource, /qualityInspectionDataScopeWhere/, '质量检验附件必须复用质量任务数据范围')
assert.match(middlewareSource, /pathname\.startsWith\('\/uploads\/'\)/, '静态上传目录必须禁止绕过附件 API 直接读取')
assert.match(middlewareSource, /'\/uploads\/:path\*'/, 'Middleware 必须覆盖静态上传目录')
assert.doesNotMatch(attachmentClientSource, /uploadedBy/, '附件客户端不得提交操作人身份')
assert.ok(readFileSync(join(root, attachmentRoutePaths[0]), 'utf8').split('\n').length <= 140, '附件主路由不得重新膨胀')
assert.ok(readFileSync(join(root, attachmentRoutePaths[1]), 'utf8').split('\n').length <= 70, '附件草稿路由不得重新膨胀')
assert.match(productionModuleSource, /系统生成单据/, '生产订单详情必须明确标识系统生成单据')
assert.match(productionModuleSource, /compactMode="summary"/, '生产订单列表必须只展示附件摘要')
assert.match(productionModuleSource, /enableAiRecognition/, '生产订单详情必须启用 AI 识别占位入口')
assert.match(salesOrderSource, /compactMode="summary"/, '销售订单列表必须只展示附件摘要')
assert.match(salesOrderSource, /title="附件管理"/, '销售订单详情必须提供完整附件管理')
assert.match(salesOrderSource, /系统生成单据/, '销售订单详情必须明确标识系统生成单据')
assert.match(detailDialogSource, /系统生成单据/, '公共单据详情必须明确标识系统生成单据')
assert.match(detailDialogSource, /title="附件管理"/, '公共单据详情必须提供完整附件管理')
assert.match(detailDialogSource, /enableAiRecognition/, '公共单据详情必须启用 AI 识别占位入口')
for (const [label, collectionPath, detailPath] of detailManagedPages) {
  const collectionSource = readFileSync(join(root, collectionPath), 'utf8')
  const pageDetailSource = readFileSync(join(root, detailPath), 'utf8')
  assert.match(collectionSource, /compactMode="summary"/, `${label}列表必须只展示附件摘要`)
  assert.match(pageDetailSource, /BusinessDocumentDetailDialog/, `${label}必须使用公共单据详情骨架`)
}

async function verifyAttachmentLifecycle() {
  const verifyRoot = await mkdtemp(join(tmpdir(), 'ml-attachments-'))
  const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
  const uploadRoot = join(verifyRoot, 'uploads')
  execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot

  const [
    { prisma },
    command,
    query,
    authorization,
    { AttachmentDomainError },
    { draftDocumentAttachmentOwnerType },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/attachments/server/attachment-command-service'),
    import('../modules/attachments/server/attachment-query-service'),
    import('../modules/attachments/server/attachment-authorization-service'),
    import('../modules/attachments/domain/attachment-errors'),
    import('../lib/draft-document-attachments'),
  ])

  try {
    const admin = await prisma.operator.create({
      data: {
        username: 'attachment-admin', passwordHash: 'verification-only', name: '附件管理员',
        role: 'ADMIN', status: 'ACTIVE',
      },
    })
    const otherAdmin = await prisma.operator.create({
      data: {
        username: 'attachment-admin-2', passwordHash: 'verification-only', name: '其他管理员',
        role: 'ADMIN', status: 'ACTIVE',
      },
    })
    const material = await prisma.material.create({
      data: { code: 'ATTACH-MAT-001', name: '附件权限物料', unit: '件' },
    })
    await authorization.requireManagedAttachmentOwnerAccessForOperator(admin, 'MATERIAL', material.id, 'read')
    await assert.rejects(
      () => authorization.requireManagedAttachmentOwnerAccessForOperator(admin, 'UNKNOWN', material.id, 'read'),
      (error: unknown) => error instanceof AttachmentDomainError && error.status === 400,
      '未知附件所属类型必须拒绝',
    )
    await assert.rejects(
      () => authorization.requireManagedAttachmentOwnerAccessForOperator(admin, 'MATERIAL', 'missing-material', 'read'),
      (error: unknown) => error instanceof AttachmentDomainError && error.status === 404,
      '不存在的业务对象不得挂载附件',
    )

    const [allowedLocation, blockedLocation] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: 'ATTACH-LOC-A', name: '附件授权库位' } }),
      prisma.inventoryLocation.create({ data: { code: 'ATTACH-LOC-B', name: '附件未授权库位' } }),
    ])
    const supplier = await prisma.supplier.create({ data: { code: 'ATTACH-SUP', name: '附件供应商' } })
    const scopedOperator = await prisma.operator.create({ data: {
      username: 'attachment-scoped', passwordHash: 'verification-only', name: '附件范围员', role: 'OPERATOR', status: 'ACTIVE',
      dataScope: { create: {
        productionMode: 'SELF', inventoryMode: 'LOCATIONS',
        locations: { create: { locationId: allowedLocation.id } },
      } },
    } })
    const [allowedReceipt, blockedReceipt] = await Promise.all([
      prisma.materialReceipt.create({ data: { inboundNo: 'ATTACH-IN-A', supplierId: supplier.id, stagingLocationId: allowedLocation.id } }),
      prisma.materialReceipt.create({ data: { inboundNo: 'ATTACH-IN-B', supplierId: supplier.id, stagingLocationId: blockedLocation.id } }),
    ])
    await authorization.requireManagedAttachmentOwnerAccessForOperator(scopedOperator, 'MATERIAL_IN', allowedReceipt.id, 'read')
    await assert.rejects(
      () => authorization.requireManagedAttachmentOwnerAccessForOperator(scopedOperator, 'MATERIAL_IN', blockedReceipt.id, 'read'),
      (error: unknown) => error instanceof AttachmentDomainError && error.status === 404,
      '即使拥有来料和附件功能权限，也不得读取未授权库位的附件',
    )

    const uploaded = await command.uploadManagedAttachment({
      ownerType: 'WORK_INSTRUCTION',
      ownerId: 'instruction-1',
      documentType: 'WORK_INSTRUCTION',
      file: new File(['controlled instruction'], 'instruction.txt', { type: 'text/plain' }),
    }, 'operator-1')
    assert.equal(uploaded.uploadedBy, 'operator-1', '附件上传人必须由服务端传入当前登录人员')
    assert.equal((await query.listManagedAttachments('WORK_INSTRUCTION', 'instruction-1'))[0].id, uploaded.id)
    const rotated = await command.setManagedAttachmentRotation(uploaded.id, 90)
    assert.equal(rotated.before.rotation, 0)
    assert.equal(rotated.updated.rotation, 90)
    await assert.rejects(
      () => command.uploadManagedAttachment({
        ownerType: 'WORK_INSTRUCTION', ownerId: 'instruction-1', documentType: 'ORIGINAL',
        file: new File([], 'empty.txt', { type: 'text/plain' }),
      }, 'operator-1'),
      AttachmentDomainError,
      '空文件必须由领域服务拒绝',
    )

    const materialFiles = await Promise.all(['first.png', 'second.png'].map(async (name) => {
      const storagePath = join(uploadRoot, 'MATERIAL', 'material-1', name)
      await mkdir(join(uploadRoot, 'MATERIAL', 'material-1'), { recursive: true })
      await writeFile(storagePath, name)
      return prisma.documentAttachment.create({
        data: {
          ownerType: 'MATERIAL', ownerId: 'material-1', documentType: 'MATERIAL_IMAGE',
          originalName: name, fileName: name, mimeType: 'image/png', size: name.length,
          url: `/uploads/MATERIAL/material-1/${name}`, storagePath,
        },
      })
    }))
    await command.setMaterialImageCover(materialFiles[1].id)
    assert.equal((await prisma.documentAttachment.findUniqueOrThrow({ where: { id: materialFiles[1].id } })).isCover, true)
    await command.archiveManagedAttachment(materialFiles[1].id)
    const [archivedCover, promotedCover] = await Promise.all([
      prisma.documentAttachment.findUniqueOrThrow({ where: { id: materialFiles[1].id } }),
      prisma.documentAttachment.findUniqueOrThrow({ where: { id: materialFiles[0].id } }),
    ])
    assert.ok(archivedCover.deletedAt, '归档附件必须保留记录并标记删除时间')
    assert.equal(promotedCover.isCover, true, '归档封面后必须自动提升另一张有效图片')

    const draftOwnerType = draftDocumentAttachmentOwnerType('MATERIAL_IN')
    const finalizeDraft = await prisma.documentAttachment.create({
      data: {
          ownerType: draftOwnerType, ownerId: 'draft-finalize', originalName: 'receipt.pdf',
          fileName: 'receipt.pdf', mimeType: 'application/pdf', size: 1, url: '/draft/receipt.pdf',
          storagePath: join(uploadRoot, 'draft-finalize.pdf'), uploadedBy: admin.id,
      },
    })
    await authorization.requireManagedAttachmentAccessForOperator(admin, finalizeDraft.id, 'read')
    await assert.rejects(
      () => authorization.requireManagedAttachmentAccessForOperator(otherAdmin, finalizeDraft.id, 'read'),
      (error: unknown) => error instanceof AttachmentDomainError && error.status === 404,
      '其他人员即使具有同类资源权限也不得读取当前人员的暂存附件',
    )
    const finalized = await command.finalizeManagedDraftAttachments({
      ownerType: 'MATERIAL_IN', draftOwnerId: 'draft-finalize', targetOwnerId: 'receipt-1',
    }, 'operator-1')
    assert.equal(finalized.count, 0, '不得绑定不属于当前登录人员的历史暂存附件')
    await prisma.documentAttachment.update({ where: { id: finalizeDraft.id }, data: { uploadedBy: 'operator-1' } })
    const ownedFinalized = await command.finalizeManagedDraftAttachments({
      ownerType: 'MATERIAL_IN', draftOwnerId: 'draft-finalize', targetOwnerId: 'receipt-1',
    }, 'operator-1')
    assert.equal(ownedFinalized.count, 1)
    assert.deepEqual(
      await prisma.documentAttachment.findUniqueOrThrow({ where: { id: finalizeDraft.id } }).then((item) => [item.ownerType, item.ownerId]),
      ['MATERIAL_IN', 'receipt-1'],
      '暂存附件必须绑定到正式业务单据',
    )

    const discardPath = join(uploadRoot, 'discard.txt')
    await mkdir(uploadRoot, { recursive: true })
    await writeFile(discardPath, 'discard')
    await prisma.documentAttachment.create({
      data: {
        ownerType: draftOwnerType, ownerId: 'draft-discard', originalName: 'discard.txt',
        fileName: 'discard.txt', mimeType: 'text/plain', size: 7, url: '/draft/discard.txt', storagePath: discardPath,
      },
    })
    assert.equal((await command.discardManagedDraftAttachments({ ownerType: 'MATERIAL_IN', draftOwnerId: 'draft-discard' }, 'operator-1')).count, 0)
    assert.equal((await access(discardPath).then(() => true, () => false)), true, '不得清理其他人员的暂存附件')
    await prisma.documentAttachment.updateMany({ where: { ownerId: 'draft-discard' }, data: { uploadedBy: 'operator-1' } })
    assert.equal((await command.discardManagedDraftAttachments({ ownerType: 'MATERIAL_IN', draftOwnerId: 'draft-discard' }, 'operator-1')).count, 1)
    await assert.rejects(access(discardPath), '取消新建必须同时清理暂存文件')

    console.log('附件管理验证通过：功能权限、所属单据数据范围、上传、归档与草稿生命周期均符合模块边界。')
  } finally {
    await prisma.$disconnect()
    await rm(verifyRoot, { recursive: true, force: true })
  }
}

verifyAttachmentLifecycle().catch((error) => {
  console.error(error)
  process.exit(1)
})
