import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const homeApp = read('app/HomeApp.tsx')
const desktopNavigation = read('app/components/navigation/DesktopNavigation.tsx')
const desktopTopNavigation = read('app/components/navigation/DesktopTopNavigation.tsx')
const siblingNavigation = read('app/components/navigation/MobileSiblingNavigation.tsx')
const preferences = read('app/components/interfacePreferences.tsx')
const systemPage = read('app/components/SystemPage.tsx')

assert.match(homeApp, /const navigationGroups: NavigationGroup\[\]/, '应用壳必须只构建一份导航分组模型')
assert.match(homeApp, /<DesktopTopNavigation groups=\{navigationGroups\}/, '桌面顶部导航必须使用统一导航模型')
assert.match(homeApp, /<DesktopNavigation[^>]*groups=\{navigationGroups\}/, '桌面侧栏必须使用统一导航模型')
assert.match(homeApp, /\{navigationGroups\.map\(\(group\) => \(/, '移动抽屉必须使用统一导航模型')
assert.match(homeApp, /<MobileSiblingNavigation group=\{activeNavigationGroup\}/, '同级菜单必须使用统一导航模型中的当前分组')
assert.match(homeApp, /<MobileSiblingNavigation[\s\S]*?<div id="topbar-actions-mobile"/, '同级菜单呼出按钮必须位于窄屏固定顶部工具条')
assert.match(homeApp, /navigationItemByShortcutKey/, '移动常用入口必须从统一导航模型解析')
assert.doesNotMatch(homeApp, /desktopNavigationGroups/, '不得再维护仅供桌面使用的并行菜单分组')
assert.match(desktopNavigation, /from '\.\/NavigationModel'/, '桌面侧栏必须复用公共导航类型')
assert.match(desktopTopNavigation, /from '\.\/NavigationModel'/, '桌面顶部导航必须复用公共导航类型')
assert.match(siblingNavigation, /group\.items\.map/, '同级菜单必须直接渲染统一分组条目')
assert.match(siblingNavigation, /const \[open, setOpen\] = useState\(false\)/, '窄屏同级菜单必须默认收起')
assert.match(siblingNavigation, /aria-expanded=\{open\}/, '窄屏同级菜单必须通过按钮呼出')
assert.match(homeApp, /fixed inset-x-0 top-0 border-b/, '窄屏顶部导航工具条必须固定在视口顶部')
assert.match(preferences, /siblingNavigationStorageKey/, '必须持久化同级菜单显示偏好')
assert.match(systemPage, />显示同级菜单按钮</, '显示设置必须提供同级菜单开关')

console.log('响应式菜单校验通过：桌面顶部、桌面侧栏、移动抽屉、移动常用入口和同级菜单共用一份导航模型。')
