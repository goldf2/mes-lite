import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import {
  parseWorkInstructionListQuery,
  workInstructionInputSchema,
  workInstructionUpdateInputSchema,
} from '@/modules/documents/contracts/work-instruction-schema'
import {
  archiveWorkInstruction,
  createAutomaticWorkInstructionTitle,
  createWorkInstruction,
  DocumentContentValidationError,
  updateWorkInstruction,
  WorkInstructionValidationError,
} from '@/modules/documents/server/work-instruction-command-service'
import { listWorkInstructions } from '@/modules/documents/server/work-instruction-query-service'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function verifySchemasAndTitle() {
  const parsed = parseWorkInstructionListQuery(new URLSearchParams({ page: '0', pageSize: '999' }))
  assert.equal(parsed.data?.page, 1, '非法页码必须回退第一页')
  assert.equal(parsed.data?.pageSize, 200, '文档分页必须限制在 200')
  assert.equal(parseWorkInstructionListQuery(new URLSearchParams({ advanced: '{' })).error, '高级搜索条件格式错误', '损坏的高级搜索 JSON 必须拒绝')
  assert.equal(workInstructionInputSchema.safeParse({ categoryId: '' }).success, false, '文档类别不能为空')
  assert.equal(workInstructionUpdateInputSchema.safeParse({ categoryId: 'category' }).success, false, '更新必须提供文档 ID')
  const title = createAutomaticWorkInstructionTitle(null, { name: '作业指导书' }, new Date('2026-08-09T02:30:00.000Z'))
  assert.equal(title, '通用 · 作业指导书 · 2026-08-09 10:30', '自动标题必须固定使用上海时区')
}

function verifyBoundaries() {
  const route = read('app/api/work-instructions/route.ts')
  const command = read('modules/documents/server/work-instruction-command-service.ts')
  const query = read('modules/documents/server/work-instruction-query-service.ts')
  const page = read('modules/documents/ui/WorkInstructionPage.tsx')
  const collection = read('modules/documents/ui/WorkInstructionCollectionView.tsx')
  const createDialog = read('modules/documents/ui/WorkInstructionCreateDialog.tsx')
  const detailDialog = read('modules/documents/ui/WorkInstructionDetailDialog.tsx')
  const fullscreenViewer = read('modules/documents/ui/WorkInstructionFullscreenViewer.tsx')
  const toolbar = read('modules/documents/ui/WorkInstructionToolbar.tsx')
  const formFields = read('modules/documents/ui/WorkInstructionFormFields.tsx')
  const client = read('modules/documents/client/documents-api.ts')
  const renderer = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  assert.match(route, /work-instruction-command-service/, '文档 API 必须委托写入领域服务')
  assert.match(route, /work-instruction-query-service/, '文档 API 必须委托查询领域服务')
  assert.match(route, /requireResourcePermission[\s\S]*writeAuditLog/, '文档 API 必须保留权限和请求审计')
  assert.doesNotMatch(route, /@\/lib\/prisma|prisma\.|\$transaction|normalizeDocumentContent|officeAttachmentMimeTypes/, '文档 API 不得保留数据库、正文或附件规则')
  assert.ok(route.split('\n').length <= 90, '文档 API 必须保持不超过 90 行的薄适配层')
  assert.match(command, /\$transaction[\s\S]*validateRelations/, '文档关联校验与写入必须处于事务边界')
  assert.match(command, /normalizeDocumentContent/, '正文规范化必须由文档领域服务拥有')
  assert.doesNotMatch(command, /NextRequest|NextResponse|requireResourcePermission/, '文档写入服务不得依赖 HTTP')
  assert.match(query, /tokenizeKeywordQuery/, '文档查询必须保留智能多关键词搜索')
  assert.match(query, /ownerIdsByAttachmentKeyword[\s\S]*withAttachmentUrls/, '附件搜索与预览摘要必须由文档查询服务装配')
  assert.match(page, /from '\.\.\/client\/documents-api'/, '文档页面必须通过模块 client 访问后端')
  assert.doesNotMatch(page, /fetch\(/, '文档页面不得直接发出 HTTP 请求')
  assert.match(page, /WorkInstructionCollectionView[\s\S]*WorkInstructionCreateDialog[\s\S]*WorkInstructionDetailDialog[\s\S]*WorkInstructionFullscreenViewer/, '文档主页面必须仅编排集合、创建、详情与全屏查看子模块')
  assert.match(page, /openFullscreenPreview[\s\S]*listInstructionAttachments[\s\S]*contentText \? -1 : 0[\s\S]*onOpenPreview/, '文档列表全屏预览必须加载完整附件，并优先打开在线正文')
  assert.match(page, /handlePreviewRegenerated[\s\S]*setItems\(\(current\)[\s\S]*primaryAttachment[\s\S]*refresh\(instruction\.primaryAttachment\)/, 'CAD 预览重建后必须刷新文档列表封面 URL')
  assert.match(page, /handlePreviewRegenerated[\s\S]*setDetail\(\(current\)[\s\S]*primaryAttachment[\s\S]*refresh\(current\.primaryAttachment\)/, 'CAD 预览重建后必须刷新当前文档详情摘要')
  assert.match(toolbar, /ResourceAdvancedSearch/, '文档工具栏必须继续复用公共高级搜索组件')
  assert.ok(page.split('\n').length <= 650, '文档主页面必须保持在 650 行编排层以内')
  assert.match(page, /useWorkInstructionMetadataActions/, '批量导入、字段设置和批量修改不得再塞入主页面组件')
  assert.match(collection, /DocumentPreviewThumb[\s\S]*SortableTableHeader/, '文档集合视图必须复用公共预览与排序表头')
  assert.match(collection, /onOpenPreview[\s\S]*全屏预览[\s\S]*onOpenDetail[\s\S]*详情/, '文档集合必须拆分全屏预览与详情入口')
  assert.match(createDialog, /ModalDialog[\s\S]*WorkInstructionFormFields/, '新建文档对话框必须复用公共弹窗与文档表单')
  assert.match(detailDialog, /DocumentFileViewer[\s\S]*OnlineDocumentEditor[\s\S]*WorkInstructionFormFields/, '详情工作区必须复用公共文件预览、正文编辑与文档表单')
  assert.match(fullscreenViewer, /OnlineDocumentEditor/, '全屏查看器必须复用公共在线正文阅读能力')
  assert.match(fullscreenViewer, /DocumentFileViewer[\s\S]*attachmentPreviewKind/, '全屏查看器必须复用公共文件预览与类型判定')
  assert.match(formFields, /OneToManyRelationField[\s\S]*OnlineDocumentEditor/, '文档表单必须复用公共一对多关联与在线正文组件')
  assert.match(client, /from '@\/modules\/attachments'[\s\S]*\/api\/work-instructions/, '文档 client 必须通过附件领域公开能力和文档 API 封装请求')
  assert.doesNotMatch(client, /\/api\/attachments/, '文档 client 不得绕过附件领域公开 client')
  assert.match(renderer, /import\('\@\/modules\/documents'\)/, '页面注册层必须从 documents 公开出口加载文档页面')
}

async function verifyDatabaseRules() {
  const suffix = randomUUID().slice(0, 8)
  const [category, workCenter, material, rawMaterial] = await Promise.all([
    prisma.documentCategory.create({ data: { name: `验证类别-${suffix}` } }),
    prisma.workCenter.create({ data: { code: `WC-${suffix}`, name: '验证中心' } }),
    prisma.material.create({ data: { code: `DOC-${suffix}`, name: '验证成品', unit: '件', category: 'FINISHED' } }),
    prisma.material.create({ data: { code: `RAW-${suffix}`, name: '验证原料', unit: '件', category: 'RAW' } }),
  ])
  const contentJson = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '现场验证正文' }] }] })
  const input = workInstructionInputSchema.parse({
    categoryId: category.id,
    materialId: material.id,
    workCenterIds: [workCenter.id, workCenter.id],
    contentJson,
  })
  const created = await createWorkInstruction(input, new Date('2026-08-09T02:30:00.000Z'))
  assert.match(created.title, new RegExp(`^${material.code} ${material.name}`), '空标题必须按产品与类别自动生成')
  assert.equal(created.contentText, '现场验证正文', '在线正文必须规范化为可搜索文本')
  assert.equal(created.workCenters.length, 1, '重复工作中心必须去重')

  await prisma.documentAttachment.create({
    data: {
      ownerType: 'WORK_INSTRUCTION', ownerId: created.id, documentType: 'WORK_INSTRUCTION',
      originalName: '验证附件.pdf', fileName: 'verify.pdf', mimeType: 'application/pdf', size: 10,
      url: '/verify.pdf', storagePath: '/tmp/verify.pdf',
    },
  })
  const query = parseWorkInstructionListQuery(new URLSearchParams({ keyword: '现场 附件', fileType: 'pdf' })).data!
  const listed = await listWorkInstructions(query)
  assert.equal(listed.data[0]?.id, created.id, '正文与附件名称必须支持空格分隔的组合关键词搜索')
  assert.equal(listed.data[0]?.attachmentCount, 1, '文档列表必须装配附件数量')
  assert.equal(listed.data[0]?.pdfCount, 1, '文档列表必须装配 PDF 数量')

  const updateInput = workInstructionUpdateInputSchema.parse({ ...input, id: created.id, title: '更新后的指导书', workCenterIds: [] })
  const updated = await updateWorkInstruction(updateInput)
  assert.equal(updated.before.title, created.title, '文档更新必须返回审计前快照')
  assert.equal(updated.instruction.workCenters.length, 0, '工作中心集合必须支持原子替换')
  await assert.rejects(
    () => createWorkInstruction(workInstructionInputSchema.parse({ ...input, materialId: rawMaterial.id })),
    WorkInstructionValidationError,
    '非成品物料不得作为作业文档关联产品',
  )
  await assert.rejects(
    () => createWorkInstruction(workInstructionInputSchema.parse({ ...input, contentJson: '{' })),
    DocumentContentValidationError,
    '损坏的在线正文必须拒绝',
  )
  await archiveWorkInstruction(created.id)
  const afterArchive = await listWorkInstructions(parseWorkInstructionListQuery(new URLSearchParams({ keyword: '更新后的指导书' })).data!)
  assert.equal(afterArchive.data.length, 0, '归档文档不得出现在默认查询中')
}

async function main() {
  verifySchemasAndTitle()
  verifyBoundaries()
  if (process.env.VERIFY_DATABASE_INTEGRATION === '1') await verifyDatabaseRules()
  console.log(`文档服务校验通过：请求契约、薄 API、查询与写入边界${process.env.VERIFY_DATABASE_INTEGRATION === '1' ? '及临时数据库集成' : ''}符合模块化约束。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
