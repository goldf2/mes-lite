import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dispatchPriorityLabels, dispatchStatusOptions } from '../modules/production/contracts/dispatch'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const pagePath = 'modules/production/ui/DispatchPageModule.tsx'
const page = read(pagePath)
const client = read('modules/production/client/dispatch-api.ts')
const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
const publicEntry = read('modules/production/index.ts')

assert.ok(!existsSync(join(root, 'app/components/DispatchPage.tsx')), '派工页不得回流根级页面目录')
assert.ok(page.split('\n').length <= 650, '派工页面协调层必须保持为不超过 650 行')
assert.doesNotMatch(page, /\bfetch\(/, '派工页面不得直接发起 HTTP 请求')
assert.match(page, /from '\.\.\/client\/dispatch-api'/, '派工页面必须通过领域客户端访问 HTTP')
assert.match(page, /DraftDocumentAttachmentPanel/, '派工新建任务必须保留公共暂存附件')
assert.match(page, /generateBusinessDocumentPdfArchives/, '派工创建后必须保留业务 PDF 归档')
assert.match(client, /export async function listDispatches/, '派工客户端必须提供列表查询')
assert.match(client, /export function createDispatch/, '派工客户端必须提供新建命令')
assert.match(client, /export function transitionDispatch/, '派工客户端必须提供状态流转命令')
assert.match(publicEntry, /DispatchPageModule/, '生产模块公开出口必须暴露派工页')
assert.match(registry, /module\.DispatchPageModule/, '页面渲染注册必须通过生产模块公开出口加载派工页')
assert.deepEqual(dispatchStatusOptions.map((option) => option.value), ['PENDING', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
assert.equal(dispatchPriorityLabels.URGENT, '紧急')

console.log(`派工模块验证通过：协调页 ${page.split('\n').length} 行，HTTP 客户端、单据附件、PDF 与状态契约已归入生产领域。`)
