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
assert.match(attachmentPanelSource, /supportsDocumentSourceCredentialRecognition/, '附件面板必须从公共注册表判断 AI 凭据识别能力')
assert.match(attachmentPanelSource, /AI 识别并填充/, '附件面板必须保留统一的 AI 识别并填充入口')
assert.match(attachmentPanelSource, /识别与字段填充服务将在下一阶段接入/, '未接入识别服务时必须提供明确反馈')

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
  assert.match(source, new RegExp(`ownerType=["']${ownerType}["']`), `${file} 必须复用公共原始凭据面板`)
}

console.log(`单据原始凭据校验通过：${ownerPageFiles.length} 类核心单据已接入，${documentSourceCredentialOwnerTypes.length} 类单据允许后续 AI 识别。`)
