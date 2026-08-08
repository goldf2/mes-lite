import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const attachmentPanelSource = readFileSync(join(root, 'app/components/AttachmentPanel.tsx'), 'utf8')
const productionModuleSource = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')
const salesOrderSource = readFileSync(join(root, 'app/components/SalesOrderPage.tsx'), 'utf8')
const detailDialogSource = readFileSync(join(root, 'app/components/BusinessDocumentDetailDialog.tsx'), 'utf8')
const detailManagedPages = [
  ['来料', 'app/components/MaterialInPage.tsx'],
  ['派工', 'app/components/DispatchPage.tsx'],
  ['发货', 'app/components/ShipmentPage.tsx'],
  ['退货', 'app/components/ReturnPage.tsx'],
] as const

assert.match(attachmentPanelSource, /title\s*=\s*'附件管理'/, '公共附件模块默认名称必须为附件管理')
assert.match(attachmentPanelSource, /compactMode\?:\s*'manage'\s*\|\s*'summary'/, '附件模块必须提供列表摘要模式')
assert.match(attachmentPanelSource, /DocumentPreviewThumb/, '附件管理必须复用公共缩略图组件')
assert.match(attachmentPanelSource, /DocumentFileViewer/, '附件管理必须复用公共文档查看器')
assert.match(attachmentPanelSource, /AI 识别并填充/, '附件管理必须保留 AI 识别并填充入口')
assert.match(attachmentPanelSource, /handleAiRecognition\(attachment\)/, '多个附件必须可以分别选择后进入 AI 识别流程')
assert.match(attachmentPanelSource, /onAiRecognize\?:\s*\(attachment:\s*ManagedAttachment\)/, 'AI 识别入口必须暴露基于附件的回调契约')
assert.match(productionModuleSource, /系统生成单据/, '生产订单详情必须明确标识系统生成单据')
assert.match(productionModuleSource, /compactMode="summary"/, '生产订单列表必须只展示附件摘要')
assert.match(productionModuleSource, /enableAiRecognition/, '生产订单详情必须启用 AI 识别占位入口')
assert.match(salesOrderSource, /compactMode="summary"/, '销售订单列表必须只展示附件摘要')
assert.match(salesOrderSource, /title="附件管理"/, '销售订单详情必须提供完整附件管理')
assert.match(salesOrderSource, /系统生成单据/, '销售订单详情必须明确标识系统生成单据')
assert.match(detailDialogSource, /系统生成单据/, '公共单据详情必须明确标识系统生成单据')
assert.match(detailDialogSource, /title="附件管理"/, '公共单据详情必须提供完整附件管理')
assert.match(detailDialogSource, /enableAiRecognition/, '公共单据详情必须启用 AI 识别占位入口')
for (const [label, sourcePath] of detailManagedPages) {
  const source = readFileSync(join(root, sourcePath), 'utf8')
  assert.match(source, /compactMode="summary"/, `${label}列表必须只展示附件摘要`)
  assert.match(source, /BusinessDocumentDetailDialog/, `${label}必须使用公共单据详情骨架`)
}

console.log('附件管理契约验证通过：单据来源标识、列表摘要、统一预览下载和 AI 识别入口均已接入。')
