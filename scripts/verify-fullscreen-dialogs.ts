import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const fullscreenToggleSource = read('app/components/FullscreenToggleButton.tsx')
const modalSource = read('app/components/ModalDialog.tsx')
const overlaySource = read('app/components/ModalOverlay.tsx')
const documentPageSource = read('modules/documents/ui/WorkInstructionPage.tsx')
const documentDetailSource = read('modules/documents/ui/WorkInstructionDetailDialog.tsx')
const documentViewerSource = read('modules/documents/ui/WorkInstructionFullscreenViewer.tsx')
const materialViewerSource = read('modules/materials/ui/material-panorama/MaterialPanoramaViewer.tsx')
const pageRegistrySource = read('lib/page-registry.ts')
const pageModulesSource = read('lib/page-modules.ts')

assert.equal(existsSync(path.join(root, 'app/components/PageModeToggleButton.tsx')), false, '公共弹窗不得保留与全屏重复的主页面打开按钮')
assert.match(modalSource, /fullscreenable = true/, '所有公共弹窗必须默认支持全屏切换')
assert.match(modalSource, /h-\[100dvh\]/, '全屏状态必须占满可视窗口')
assert.doesNotMatch(modalSource, /pageable|pageMode|mesPagePresentation|openAsPage|returnToDialog/, '公共弹窗不得继续维护主页面打开状态')
assert.match(fullscreenToggleSource, /进入全屏/, '全屏按钮必须提供进入全屏标签')
assert.match(fullscreenToggleSource, /退出全屏/, '同一个全屏按钮必须允许还原弹窗')
assert.doesNotMatch(overlaySource, /portalTargetId|lockBody|trapFocus/, '公共浮层不得保留已废弃的主页面挂载分支')
assert.doesNotMatch(pageRegistrySource, /allowOpenAsPage|allowFullscreen/, '页面注册表不得保留已失效的平行打开能力开关')
assert.doesNotMatch(pageModulesSource, /PageOpenSource|resolvePageOpenMode|allowOpenAsPage|allowFullscreen/, '页面模块不得重新暴露已失效的打开能力 API')
assert.match(documentPageSource, /<WorkInstructionDetailDialog/, '产品文档主页必须装配详情弹窗任务组件')
assert.match(documentDetailSource, /<ModalDialog/, '产品文档详情必须使用公共页面弹窗')
assert.doesNotMatch(`${documentPageSource}\n${documentDetailSource}`, /type="checkbox"[\s\S]{0,240}全屏显示/, '产品文档不得继续使用复选框表达全屏动作')
assert.match(documentViewerSource, /<ModalOverlay[\s\S]*!z-\[300\]/, '文档全屏预览必须通过公共顶层浮层显示在详情弹窗之上')
assert.match(materialViewerSource, /<ModalOverlay[\s\S]*!z-\[300\]/, '物料全景文件预览必须通过公共顶层浮层显示在详情弹窗之上')
assert.match(overlaySource, /rootRef\.current\?\.contains\(activeDialog\)/, '多层公共弹窗必须只允许最上层响应键盘关闭与焦点圈定')

console.log('页面形态验证通过：公共弹窗只保留一个可逆的全屏切换按钮。')
