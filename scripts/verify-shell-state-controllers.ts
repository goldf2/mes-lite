import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const readSource = (file: string) => readFileSync(join(root, file), 'utf8')

const homeAppSource = readSource('app/HomeApp.tsx')
const desktopNavigationSource = readSource('app/components/shell/useDesktopNavigationController.ts')
const pageNavigationSource = readSource('app/components/shell/usePageNavigationController.ts')
const workspacePreferenceSource = readSource('app/components/shell/useWorkspacePreferenceController.ts')

assert.match(homeAppSource, /usePageNavigationController\(/, '应用壳必须通过页面导航控制器装配页面状态')
assert.match(homeAppSource, /useWorkspacePreferenceController\(/, '应用壳必须通过工作区偏好控制器装配用户偏好')
assert.match(homeAppSource, /useDesktopNavigationController\(/, '应用壳必须通过桌面导航控制器装配导航交互')
assert.doesNotMatch(homeAppSource, /readPageContinuity|writePageContinuity|history\.replaceState/, '应用壳不得重新内联页面连续性和 URL 同步')
assert.doesNotMatch(homeAppSource, /fetch\('\/api\/workspace-(?:preferences|usage)'/, '应用壳不得重新内联工作区偏好请求')
assert.ok(homeAppSource.split('\n').length <= 900, '应用壳必须保持在 900 行以内')

assert.match(desktopNavigationSource, /useDesktopNavigationPreference/, '桌面导航控制器必须统一读取导航显示偏好')
assert.match(desktopNavigationSource, /useWorkspaceLayoutPreference/, '桌面导航控制器必须统一读取工作区布局偏好')
assert.match(desktopNavigationSource, /transientNavigationOpen/, '桌面导航控制器必须管理自动隐藏导航状态')
assert.match(desktopNavigationSource, /handleSidebarResizePointerDown/, '桌面导航控制器必须管理侧栏拖动调整')

assert.match(pageNavigationSource, /readPageContinuity/, '页面导航控制器必须恢复页面连续性')
assert.match(pageNavigationSource, /writePageContinuity/, '页面导航控制器必须保存页面连续性')
assert.match(pageNavigationSource, /history\.replaceState/, '页面导航控制器必须保持可分享 URL')
assert.match(pageNavigationSource, /scrollPositions/, '页面导航控制器必须保存和恢复页面滚动位置')
assert.match(pageNavigationSource, /openBomEditor/, '页面导航控制器必须保留跨物料与 BOM 的连续跳转')

assert.match(workspacePreferenceSource, /fetch\('\/api\/workspace-preferences'/, '工作区偏好控制器必须读取和保存用户偏好')
assert.match(workspacePreferenceSource, /fetch\('\/api\/workspace-usage'/, '工作区偏好控制器必须记录功能使用次数')
assert.match(workspacePreferenceSource, /isWorkspaceFunctionKey/, '工作区偏好控制器必须过滤无效功能键')

console.log('应用壳状态控制器验证通过：页面连续性、URL、滚动恢复和工作区偏好均已脱离 HomeApp。')
