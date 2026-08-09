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
  ['退货', 'modules/sales/ui/ReturnPageModule.tsx', 'modules/sales/ui/ReturnPageModule.tsx'],
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
  'modules/attachments/client/attachment-api.ts',
  'modules/attachments/index.ts',
]) {
  assert.ok(readFileSync(join(root, modulePath), 'utf8').length > 0, `附件模块缺少 ${modulePath}`)
}
for (const routePath of attachmentRoutePaths) {
  const source = readFileSync(join(root, routePath), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|prisma\.|\$transaction/, `${routePath} 必须保持为薄 HTTP 层`)
}
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
    { AttachmentDomainError },
    { draftDocumentAttachmentOwnerType },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/attachments/server/attachment-command-service'),
    import('../modules/attachments/server/attachment-query-service'),
    import('../modules/attachments/domain/attachment-errors'),
    import('../lib/draft-document-attachments'),
  ])

  try {
    const uploaded = await command.uploadManagedAttachment({
      ownerType: 'WORK_INSTRUCTION',
      ownerId: 'instruction-1',
      documentType: 'WORK_INSTRUCTION',
      file: new File(['controlled instruction'], 'instruction.txt', { type: 'text/plain' }),
    })
    assert.equal((await query.listManagedAttachments('WORK_INSTRUCTION', 'instruction-1'))[0].id, uploaded.id)
    const rotated = await command.setManagedAttachmentRotation(uploaded.id, 90)
    assert.equal(rotated.before.rotation, 0)
    assert.equal(rotated.updated.rotation, 90)
    await assert.rejects(
      () => command.uploadManagedAttachment({
        ownerType: 'WORK_INSTRUCTION', ownerId: 'instruction-1', documentType: 'ORIGINAL',
        file: new File([], 'empty.txt', { type: 'text/plain' }),
      }),
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
        storagePath: join(uploadRoot, 'draft-finalize.pdf'),
      },
    })
    const finalized = await command.finalizeManagedDraftAttachments({
      ownerType: 'MATERIAL_IN', draftOwnerId: 'draft-finalize', targetOwnerId: 'receipt-1',
    })
    assert.equal(finalized.count, 1)
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
    assert.equal((await command.discardManagedDraftAttachments({ ownerType: 'MATERIAL_IN', draftOwnerId: 'draft-discard' })).count, 1)
    await assert.rejects(access(discardPath), '取消新建必须同时清理暂存文件')

    console.log('附件管理验证通过：公共客户端、薄 API、上传、旋转、封面、归档与草稿生命周期均符合模块边界。')
  } finally {
    await prisma.$disconnect()
    await rm(verifyRoot, { recursive: true, force: true })
  }
}

verifyAttachmentLifecycle().catch((error) => {
  console.error(error)
  process.exit(1)
})
