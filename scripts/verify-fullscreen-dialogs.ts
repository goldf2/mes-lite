import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const toggleSource = read('app/components/FullscreenToggleButton.tsx')
const pageToggleSource = read('app/components/PageModeToggleButton.tsx')
const modalSource = read('app/components/ModalDialog.tsx')
const overlaySource = read('app/components/ModalOverlay.tsx')
const homeSource = read('app/HomeApp.tsx')
const businessDetailSource = read('app/components/BusinessDocumentDetailDialog.tsx')
const shipmentCreateSource = read('app/components/ShipmentCreateDialog.tsx')
const documentSource = read('app/components/WorkInstructionPage.tsx')

assert.match(toggleSource, /Maximize2/, '全屏按钮必须使用明确的进入全屏图标')
assert.match(toggleSource, /Minimize2/, '全屏按钮必须使用明确的退出全屏图标')
assert.match(modalSource, /fullscreenable/, '公共弹窗必须声明可选全屏能力')
assert.match(modalSource, /fullscreenable = true/, '所有公共弹窗必须默认提供全屏按钮')
assert.match(modalSource, /pageable = true/, '所有公共弹窗必须默认支持主页面模式')
assert.match(modalSource, /h-\[100dvh\]/, '全屏弹窗必须使用动态视口高度')
assert.match(modalSource, /mesPagePresentation/, '主页面模式必须写入历史记录以支持返回弹窗')
assert.match(pageToggleSource, /在主页面打开/, '页面形态按钮必须明确提供主页面打开动作')
assert.match(pageToggleSource, /返回弹窗/, '页面形态按钮必须允许返回弹窗')
assert.match(overlaySource, /portalTargetId/, '公共浮层必须支持切换到主内容容器')
assert.match(homeSource, /id="mes-page-content-host"/, '应用主内容区必须提供页面模式挂载点')
assert.match(businessDetailSource, /fullscreenable/, '业务单据详情必须允许进入全屏')
assert.match(shipmentCreateSource, /fullscreenable/, '关联单据创建弹窗必须允许进入全屏')
assert.match(documentSource, /<ModalDialog/, '产品文档详情必须使用公共页面弹窗')
assert.doesNotMatch(documentSource, /type="checkbox"[\s\S]{0,240}全屏显示/, '产品文档不得继续使用复选框表达全屏动作')

console.log('页面形态验证通过：公共弹窗支持可逆全屏、主页面打开和返回弹窗。')
