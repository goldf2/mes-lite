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

const attachmentPanelSource = readFileSync(join(root, 'app/components/AttachmentPanel.tsx'), 'utf8')
const draftPanelSource = readFileSync(join(root, 'app/components/DraftDocumentAttachmentPanel.tsx'), 'utf8')
const draftRouteSource = readFileSync(join(root, 'app/api/attachments/drafts/route.ts'), 'utf8')
const recognitionRouteSource = readFileSync(join(root, 'app/api/ai/document-recognition/route.ts'), 'utf8')
assert.match(attachmentPanelSource, /supportsDocumentSourceCredentialRecognition/, '附件面板必须从公共注册表判断 AI 凭据识别能力')
assert.match(attachmentPanelSource, /AI 识别并填充/, '附件面板必须保留统一的 AI 识别并填充入口')
assert.match(draftPanelSource, /finalizeDraftDocumentAttachments/, '新建单据附件必须提供创建后绑定能力')
assert.match(draftPanelSource, /discardDraftDocumentAttachments/, '取消新建时必须清理暂存附件')
assert.match(draftPanelSource, /\/api\/ai\/document-recognition/, '新建单据必须调用统一 AI 凭据识别接口')
assert.match(draftRouteSource, /updateMany/, '暂存附件必须通过公共服务端接口绑定')
assert.match(draftRouteSource, /removeAttachmentStoredFiles/, '放弃新建时必须同时清理暂存文件和派生文件')
assert.match(recognitionRouteSource, /attachment\.ownerId !== input\.ownerId/, 'AI 识别必须校验附件属于当前表单暂存区')
assert.match(recognitionRouteSource, /score >= 0\.7/, '低置信度字段不得自动回填')
assert.match(recognitionRouteSource, /note: '未记录凭据正文和识别字段内容'/, 'AI 识别审计不得保存凭据正文或识别字段')

const ownerPageFiles: Array<[string, string]> = [
  ['app/components/MaterialInPage.tsx', 'MATERIAL_IN'],
  ['modules/production/ui/ProductionOrderModule.tsx', 'PRODUCTION_ORDER'],
  ['app/components/DispatchPage.tsx', 'DISPATCH'],
  ['app/components/SalesOrderPage.tsx', 'SALES_ORDER'],
  ['app/components/ShipmentPage.tsx', 'SHIPMENT'],
  ['app/components/ReturnPage.tsx', 'RETURN_ORDER'],
]

for (const [file, ownerType] of ownerPageFiles) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(source, /DraftDocumentAttachmentPanel/, `${file} 新建流程必须复用公共暂存附件面板`)
  assert.match(source, new RegExp(`ownerType=["']${ownerType}["']`), `${file} 必须声明正确的原始凭据归属类型`)
  assert.match(source, new RegExp(`finalizeDraftDocumentAttachments\\(\\{[\\s\\S]*?ownerType: ["']${ownerType}["']`), `${file} 创建成功后必须绑定暂存附件`)
}

console.log(`单据原始凭据校验通过：${ownerPageFiles.length} 类核心单据支持新建时上传、AI 高置信度回填、创建后绑定和取消清理。`)
