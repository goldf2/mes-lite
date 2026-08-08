import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const attachmentPanelSource = readFileSync(join(root, 'app/components/AttachmentPanel.tsx'), 'utf8')
const productionModuleSource = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')

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

console.log('附件管理契约验证通过：单据来源标识、列表摘要、统一预览下载和 AI 识别入口均已接入。')
