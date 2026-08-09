import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  documentSourceCredentialOwnerTypes,
  supportsDocumentSourceCredentialRecognition,
} from '../lib/document-source-credentials'

const root = process.cwd()

for (const ownerType of documentSourceCredentialOwnerTypes) {
  assert.equal(supportsDocumentSourceCredentialRecognition(ownerType), true, ownerType)
}
assert.equal(supportsDocumentSourceCredentialRecognition('MATERIAL', 'MATERIAL_IMAGE'), false)
assert.equal(supportsDocumentSourceCredentialRecognition('WORK_INSTRUCTION'), false)

const attachmentPanelSource = readFileSync(join(root, 'modules/attachments/ui/AttachmentPanel.tsx'), 'utf8')
const draftPanelSource = readFileSync(join(root, 'modules/attachments/ui/DraftDocumentAttachmentPanel.tsx'), 'utf8')
const recognitionClientSource = readFileSync(join(root, 'modules/attachments/client/document-recognition-api.ts'), 'utf8')
const recognitionServiceSource = readFileSync(join(root, 'modules/attachments/server/document-recognition-service.ts'), 'utf8')
const recognitionDomainSource = readFileSync(join(root, 'modules/attachments/domain/document-recognition.ts'), 'utf8')
const draftRouteSource = readFileSync(join(root, 'app/api/attachments/drafts/route.ts'), 'utf8')
const attachmentCommandSource = readFileSync(join(root, 'modules/attachments/server/attachment-command-service.ts'), 'utf8')
const recognitionRouteSource = readFileSync(join(root, 'app/api/ai/document-recognition/route.ts'), 'utf8')
assert.match(attachmentPanelSource, /supportsDocumentSourceCredentialRecognition/, '附件面板必须从公共注册表判断 AI 凭据识别能力')
assert.match(attachmentPanelSource, /AI 识别并填充/, '附件面板必须保留统一的 AI 识别并填充入口')
assert.match(draftPanelSource, /finalizeDraftDocumentAttachments/, '新建单据附件必须提供创建后绑定能力')
assert.match(draftPanelSource, /discardDraftDocumentAttachments/, '取消新建时必须清理暂存附件')
assert.match(draftPanelSource, /recognizeDocument/, '新建单据必须通过附件模块 client 调用 AI 凭据识别')
assert.match(recognitionClientSource, /\/api\/ai\/document-recognition/, '附件模块 client 必须调用统一 AI 凭据识别接口')
assert.match(draftRouteSource, /finalizeManagedDraftAttachments/, '暂存附件路由必须委托公共服务绑定')
assert.match(attachmentCommandSource, /updateMany/, '暂存附件服务必须批量绑定正式业务单据')
assert.match(attachmentCommandSource, /removeAttachmentStoredFiles/, '放弃新建时必须同时清理暂存文件和派生文件')
assert.match(recognitionServiceSource, /attachment\.ownerId !== input\.ownerId/, 'AI 识别服务必须校验附件属于当前表单暂存区')
assert.match(recognitionDomainSource, /score >= 0\.7/, '低置信度字段不得自动回填')
assert.match(recognitionRouteSource, /note: '未记录凭据正文和识别字段内容'/, 'AI 识别审计不得保存凭据正文或识别字段')

const ownerPageFiles: Array<[string[], string]> = [
  [['modules/receiving/ui/MaterialInPage.tsx', 'modules/receiving/ui/MaterialInEditorDialog.tsx'], 'MATERIAL_IN'],
  [['modules/production/ui/ProductionOrderModule.tsx'], 'PRODUCTION_ORDER'],
  [['modules/production/ui/DispatchPageModule.tsx'], 'DISPATCH'],
  [['modules/sales/ui/SalesOrderPageModule.tsx'], 'SALES_ORDER'],
  [['modules/sales/ui/ShipmentCreateDialog.tsx'], 'SHIPMENT'],
  [['modules/sales/ui/ReturnPageModule.tsx'], 'RETURN_ORDER'],
]

for (const [files, ownerType] of ownerPageFiles) {
  const source = files.map((file) => readFileSync(join(root, file), 'utf8')).join('\n')
  const label = files.join(' + ')
  assert.match(source, /DraftDocumentAttachmentPanel/, `${label} 新建流程必须复用公共暂存附件面板`)
  assert.match(source, new RegExp(`ownerType=["']${ownerType}["']`), `${label} 必须声明正确的原始凭据归属类型`)
  assert.match(source, new RegExp(`finalizeDraftDocumentAttachments\\(\\{[\\s\\S]*?ownerType: ["']${ownerType}["']`), `${label} 创建成功后必须绑定暂存附件`)
}

console.log(`单据原始凭据校验通过：${ownerPageFiles.length} 类核心单据支持新建时上传、AI 高置信度回填、创建后绑定和取消清理。`)
