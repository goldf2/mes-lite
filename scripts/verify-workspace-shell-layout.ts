import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const readSource = (file: string) => readFileSync(join(root, file), 'utf8')

const preferenceSource = readSource('app/components/interfacePreferences.tsx')
const shellSource = readSource('app/page.tsx')
const topNavigationSource = readSource('app/components/navigation/DesktopTopNavigation.tsx')
const toolbarSource = readSource('app/components/ResponsiveToolbarActions.tsx')
const displaySettingsSource = readSource('app/components/SystemPage.tsx')

assert.match(
  preferenceSource,
  /type WorkspaceLayoutMode\s*=\s*'sidebar'\s*\|\s*'canvas'/,
  '工作区偏好必须明确支持标准管理和画布工作两种布局',
)
assert.match(
  preferenceSource,
  /type DesktopNavigationBehavior\s*=\s*'persistent'\s*\|\s*'auto-hide'/,
  '标准管理左栏必须明确支持常驻和自动隐藏',
)
assert.match(
  preferenceSource,
  /layout:\s*'sidebar'[\s\S]*?navigationBehavior:\s*'persistent'/,
  '升级后的默认工作区必须保持标准管理和左栏常驻',
)

assert.match(shellSource, /DesktopTopNavigation/, '公共应用壳必须接入顶部导航组件')
assert.match(shellSource, /useWorkspaceLayoutPreference/, '公共应用壳必须读取统一工作区偏好')
assert.match(shellSource, /layout\s*===\s*'canvas'/, '公共应用壳必须按画布工作布局切换槽位')
assert.match(shellSource, /navigationBehavior\s*===\s*'auto-hide'/, '公共应用壳必须实现左栏自动隐藏分支')
assert.match(shellSource, /translate-x/, '自动隐藏左栏必须使用不推动正文的覆盖位移动效')
assert.match(shellSource, /固定导航|自动隐藏导航/, '左栏必须提供常驻与自动隐藏的显式切换')
assert.match(shellSource, /切换到画布工作布局|切换到标准管理布局/, '全局应用壳必须提供工作区形态切换按钮')

assert.match(topNavigationSource, /groups:\s*DesktopNavigationGroup\[\]/, '顶部导航必须复用公共导航分组类型')
assert.match(topNavigationSource, /更多/, '顶部导航宽度不足时必须提供单行溢出菜单')
assert.doesNotMatch(topNavigationSource, /flex-wrap/, '画布工作的顶部导航不得换行')
assert.doesNotMatch(topNavigationSource, /ChevronDown|group\.icon/, '画布工作的顶部一级导航必须使用紧凑纯文字按钮，不显示文字图标或箭头')
assert.doesNotMatch(topNavigationSource, /onPointerEnter|onMouseEnter|scheduleGroupSwitch|HOVER_SWITCH_DELAY_MS/, '顶部一级菜单必须只响应点击，不得因鼠标经过打开或切换弹层')
assert.match(topNavigationSource, /panelTriggerRef[\s\S]*?getBoundingClientRect\(\)\.left\s*-\s*rootRect\.left/, '顶部二级菜单必须跟随触发入口定位')
assert.match(topNavigationSource, /COMPACT_PANEL_WIDTH_PX[\s\S]*?compactGroupPanel/, '少量功能的顶部二级菜单必须使用紧凑尺寸')
assert.match(topNavigationSource, /isOpenGroup[\s\S]*?bg-blue-600 text-white/, '当前打开的顶部一级菜单必须显示主高亮')
assert.match(topNavigationSource, /group\.active[\s\S]*?bg-blue-50 text-blue-700 ring-1/, '当前页面所属一级菜单必须使用区别于选择状态的稳定弱高亮')

assert.match(toolbarSource, /useWorkspaceLayoutPreference/, '公共页面工具必须读取工作区布局')
assert.match(toolbarSource, /layout\s*===\s*'canvas'/, '公共页面工具必须提供画布工作右侧呈现')
assert.match(toolbarSource, /页面工具/, '画布工作右侧栏必须保留公共页面工具语义')

assert.match(displaySettingsSource, /useWorkspaceLayoutPreference/, '显示设置必须读写工作区布局偏好')
assert.match(displaySettingsSource, /标准管理/, '显示设置必须提供标准管理布局')
assert.match(displaySettingsSource, /画布工作/, '显示设置必须提供画布工作布局')
assert.match(displaySettingsSource, /常驻显示/, '显示设置必须提供左栏常驻行为')
assert.match(displaySettingsSource, /自动隐藏/, '显示设置必须提供左栏自动隐藏行为')

console.log('工作区应用壳静态契约验证通过：两种布局、左栏常驻/自动隐藏、顶部导航与右侧公共工具均已接入。')
