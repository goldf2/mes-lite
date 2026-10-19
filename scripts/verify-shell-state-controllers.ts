import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const readSource = (file: string) => readFileSync(join(root, file), 'utf8')

const homeAppSource = readSource('app/HomeApp.tsx')
const applicationNavigationSource = readSource('app/components/shell/useApplicationNavigationController.tsx')
const desktopNavigationSource = readSource('app/components/shell/useDesktopNavigationController.ts')
const pageNavigationSource = readSource('app/components/shell/usePageNavigationController.ts')
const workspacePreferenceSource = readSource('app/components/shell/useWorkspacePreferenceController.ts')

assert.match(homeAppSource, /useApplicationNavigationController\(/, '应用壳必须通过应用导航控制器装配权限、菜单和页面状态')
assert.match(homeAppSource, /useWorkspacePreferenceController\(/, '应用壳必须通过工作区偏好控制器装配用户偏好')
assert.match(homeAppSource, /useDesktopNavigationController\(/, '应用壳必须通过桌面导航控制器装配导航交互')
assert.doesNotMatch(homeAppSource, /usePageNavigationController\(/, '应用壳不得越过应用导航控制器直接装配页面状态')
assert.doesNotMatch(homeAppSource, /primaryNavigationItems|workspaceFunctionCatalog|workspaceContainsFunction|mes-lite\.nav\.order/, '应用壳不得重新内联菜单目录、工作区过滤或排序存储')
assert.doesNotMatch(homeAppSource, /readPageContinuity|writePageContinuity|history\.replaceState/, '应用壳不得重新内联页面连续性和 URL 同步')
assert.doesNotMatch(homeAppSource, /fetch\('\/api\/workspace-(?:preferences|usage)'/, '应用壳不得重新内联工作区偏好请求')
assert.ok(homeAppSource.split('\n').length <= 600, '应用壳必须保持在 600 行以内')

assert.match(applicationNavigationSource, /usePageNavigationController\(/, '应用导航控制器必须统一装配页面连续性')
assert.match(applicationNavigationSource, /useWorkspaceNavigation\(/, '应用导航控制器必须统一读取工作区菜单配置')
assert.match(applicationNavigationSource, /primaryNavigationItems/, '应用导航控制器必须从公共导航目录派生菜单')
assert.match(applicationNavigationSource, /workspaceContainsFunction/, '应用导航控制器必须根据工作区配置过滤功能')
assert.match(applicationNavigationSource, /navigationOrderStorageKey/, '应用导航控制器必须统一管理菜单顺序持久化')
assert.match(applicationNavigationSource, /mobilePrimaryItems/, '应用导航控制器必须从同一菜单模型派生移动端快捷入口')

assert.match(desktopNavigationSource, /useDesktopNavigationPreference/, '桌面导航控制器必须统一读取导航显示偏好')
assert.match(desktopNavigationSource, /useWorkspaceLayoutPreference/, '桌面导航控制器必须统一读取工作区布局偏好')
assert.match(desktopNavigationSource, /transientNavigationOpen/, '桌面导航控制器必须管理自动隐藏导航状态')
assert.match(desktopNavigationSource, /handleSidebarResizePointerDown/, '桌面导航控制器必须管理侧栏拖动调整')

assert.match(pageNavigationSource, /readPageContinuity/, '页面导航控制器必须恢复页面连续性')
assert.match(pageNavigationSource, /writePageContinuity/, '页面导航控制器必须保存页面连续性')
assert.match(pageNavigationSource, /history\.replaceState/, '页面导航控制器必须保持可分享 URL')
assert.match(pageNavigationSource, /scrollPositions/, '页面导航控制器必须保存和恢复页面滚动位置')
assert.match(applicationNavigationSource, /pageContextKey: selectedBusinessPageContext/, '应用控制器必须传入经过可用模块校验的落地页上下文')
assert.match(pageNavigationSource, /pageContextKey\?: string/, '公共页面连续性必须支持通用上下文键，不得反向依赖业务模块类型')
assert.match(pageNavigationSource, /businessOverview \? positions\?\.businessWorkbench : undefined/, '旧业务总览滚动记录仅可由新总览继承，不能落入模块')
assert.match(pageNavigationSource, /scopedBusinessPage \? \{ contentTop: 0, windowTop: 0 \} : undefined/, '没有历史位置的模块落地页必须首次置顶，其他页面保留既有策略')
assert.match(pageNavigationSource, /openBomEditor/, '页面导航控制器必须保留跨物料与 BOM 的连续跳转')

assert.match(workspacePreferenceSource, /loadWorkspacePreference/, '工作区偏好控制器必须通过所属模块 client 读取用户偏好')
assert.match(workspacePreferenceSource, /saveWorkspacePreferenceRequest/, '工作区偏好控制器必须通过所属模块 client 保存用户偏好')
assert.match(workspacePreferenceSource, /recordWorkspaceUsageRequest/, '工作区偏好控制器必须通过所属模块 client 记录功能使用次数')
assert.doesNotMatch(workspacePreferenceSource, /\bfetch\s*\(/, '工作区偏好控制器不得直接请求 API')
assert.match(workspacePreferenceSource, /isWorkspaceFunctionKey/, '工作区偏好控制器必须过滤无效功能键')

console.log('应用壳状控制器验证通过：权限菜单、页面连续性、URL、滚动恢复和工作区偏好均已脱离 HomeApp。')
