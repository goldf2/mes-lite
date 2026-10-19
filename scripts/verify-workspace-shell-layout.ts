import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const readSource = (file: string) => readFileSync(join(root, file), 'utf8')

const preferenceSource = readSource('app/components/interfacePreferences.tsx')
const shellSource = readSource('app/HomeApp.tsx')
const desktopNavigationControllerSource = readSource('app/components/shell/useDesktopNavigationController.ts')
const topNavigationSource = readSource('app/components/navigation/DesktopTopNavigation.tsx')
const toolbarSource = readSource('app/components/ResponsiveToolbarActions.tsx')
const displaySettingsSource = readSource('modules/system-settings/ui/DisplaySettingsPage.tsx')
const applicationSelectorSource = readSource('app/components/navigation/CapabilityModuleButtons.tsx')
const applicationNavigationSource = readSource('app/components/shell/useApplicationNavigationController.tsx')
const platformEntrySource = readSource('app/platform/page.tsx')
const mesEntrySource = readSource('app/page.tsx')
const workbenchEntrySource = readSource('app/workbench/page.tsx')
const middlewareSource = readSource('middleware.ts')
const desktopAsideSource = shellSource.match(/<aside[\s\S]*?<\/aside>/)?.[0] || ''
const mainOpeningSource = shellSource.match(/<main className=\{`[\s\S]*?`\}>/)?.[0] || ''

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
assert.match(shellSource, /useDesktopNavigationController/, '公共应用壳必须通过桌面导航控制器读取统一偏好')
assert.match(shellSource, /layout\s*===\s*'canvas'/, '公共应用壳必须按画布工作布局切换槽位')
assert.match(shellSource, /translate-x/, '自动隐藏左栏的位移动效必须与正文避让同步')
assert.match(shellSource, /onClick=\{toggleDesktopNavigation\}/, '桌面左栏必须由固定位置的统一入口开合')
assert.match(shellSource, /aria-label=\{desktopNavigationTriggerLabel\}/, '桌面左栏入口必须在常驻和自动隐藏状态下复用同一个按钮')
assert.match(shellSource, /desktopNavigationTriggerRef[\s\S]*?CapabilityModuleButtons/, '标准管理布局必须同时保留左上角导航入口和产品模块按钮')
assert.match(shellSource, /<CapabilityModuleButtons[\s\S]{0,500}?modules=\{availableBusinessApplications\}[\s\S]{0,500}?onOpenModule=\{openBusinessApplication\}[\s\S]{0,500}?aria-label=\{autoHideDesktopNavigation \? '固定导航' : '改为自动隐藏'\}/, '导航固定按钮必须与真实业务应用选择器位于同一顶部控制区')
assert.match(applicationSelectorSource, /切换业务应用/, '公共选择器必须明确切换一级业务应用')
assert.doesNotMatch(applicationSelectorSource, /MRP|ERP|onOpenHome|reservedDescriptions/, '一级应用选择器不得恢复不可用预留应用或重复 MES 首页入口')
assert.match(platformEntrySource, /<HomeApp platformEntry\s+\{\.\.\.businessEntryUrls\(\)\}\s*\/>/, '独立平台入口必须由服务端传入运行时 MES 和平台公开地址')
assert.match(mesEntrySource, /<HomeApp\s+\{\.\.\.businessEntryUrls\(\)\}\s*\/>/, '原根地址必须保留 MES 首页并接收同一运行时入口配置')
assert.doesNotMatch(mesEntrySource, /<HomeApp\b[^>]*\bplatformEntry\b/, 'MES 根入口不得变成平台首页')
assert.match(workbenchEntrySource, /redirect\(businessEntryUrls\(\)\.platformUrl\s*\|\|\s*'\/platform'\)/, '旧工作台地址必须优先跳转至配置的平台域，未配置时保留 /platform 兼容入口')
assert.match(middlewareSource, /if\s*\(pathname\s*===\s*'\/'\s*&&\s*publicOrigin\s*===\s*businessEntryUrls\(\)\.platformUrl\)\s*\{[\s\S]*?destination\.pathname\s*=\s*'\/platform'[\s\S]*?NextResponse\.rewrite\(destination\)/, '只有精确匹配平台公开 origin 的根地址才允许重写为平台页面')
assert.equal((middlewareSource.match(/NextResponse\.rewrite\(/g) || []).length, 1, '入口重写不得扩展到 MES 域、子路径或其他请求')
assert.match(applicationNavigationSource, /openBusinessPlatform[\s\S]*?new URL\(platformUrl\s*\|\|\s*'\/platform',\s*window\.location\.origin\)[\s\S]*?window\.location\.assign\(destination\.href\)/, 'MES 返回平台必须使用运行时平台地址，保留未配置时的独立入口')
assert.match(applicationNavigationSource, /if\s*\(platformEntry\)\s*\{[\s\S]*?new URL\('\/',\s*mesUrl\s*\|\|\s*window\.location\.origin\)[\s\S]*?searchParams\.set\('page', target\.tab\)[\s\S]*?target\.materialSection[\s\S]*?window\.location\.assign\(destination\.href\)/, '平台原生功能必须导航到配置的 MES 根域，并保留真实页面与物料子页')
assert.match(applicationNavigationSource, /getAvailableBusinessApplications\(workspaceFunctionItems\)/, '可用一级应用必须从当前授权真实功能目录派生')
assert.match(applicationNavigationSource, /isPlatformSurface \? \[\] : allNavigationGroups/, '平台总览不得混入 MES 或客户管理侧栏')
assert.match(shellSource, /desktopNavigationExpanded = !isPlatformSurface && desktopNavigationOccupiesSpace/, '平台总览必须关闭 MES 侧栏占位')
assert.match(desktopAsideSource, /isPlatformSurface \|\| canvasWorkspace[\s\S]*?'lg:hidden'/, '平台总览与画布工作必须隐藏左侧 MES 面板')
assert.doesNotMatch(shellSource, /text-gray-500">全部功能<\/div>/, '桌面侧栏不得保留无额外信息的“全部功能”标题行')
assert.match(shellSource, /autoHideDesktopNavigation[\s\S]*?aria-hidden="true"[\s\S]*?onPointerEnter=\{scheduleDesktopNavigationOpen\}[\s\S]*?w-\[30px\]/, '自动隐藏左栏必须提供持续存在的屏幕左侧 30px 悬停感应带')
assert.doesNotMatch(shellSource, /ref=\{desktopNavigationTriggerRef\}[\s\S]{0,360}?onPointerEnter/, '左上角固定导航按钮不得承担悬停呼出，避免与左侧感应带重复触发')
assert.match(shellSource, /ref=\{desktopNavigationPanelRef\}[\s\S]*?onPointerEnter=\{keepDesktopNavigationOpen\}[\s\S]*?onPointerLeave=\{scheduleDesktopNavigationClose\}/, '鼠标从入口移入侧栏时必须保持面板打开')
assert.match(desktopAsideSource, /bg-white shadow-lg/, '常驻和自动隐藏左栏必须复用同一面板阴影外观')
assert.match(desktopAsideSource, /resizing \? 'transition-none' : 'transition-\[transform,width\] duration-200 motion-reduce:transition-none'/, '左栏展开及宽度变化必须同步过渡，直接拖动时立即跟随')
assert.match(mainOpeningSource, /resizing \? 'transition-none' : 'transition-\[margin\] duration-200 motion-reduce:transition-none'/, '正文必须与侧栏使用同一过渡时长及拖动即时策略')
assert.match(desktopNavigationControllerSource, /type TransientNavigationMode\s*=\s*'closed'\s*\|\s*'hover'\s*\|\s*'click'/, '桌面导航控制器必须区分关闭、悬停呼出和点击锁定')
assert.doesNotMatch(desktopNavigationControllerSource, /openTimerRef|hoverOpenDelayMs/, '进入左侧 30px 感应带必须立即呼出，不得要求停留等待')
assert.match(desktopNavigationControllerSource, /scheduleDesktopNavigationOpen[\s\S]*?setTransientNavigationMode\(\(current\)\s*=>\s*current\s*===\s*'closed'\s*\?\s*'hover'/, '感应带必须在指针进入时直接切换为悬停呼出状态')
assert.match(desktopNavigationControllerSource, /current\s*===\s*'hover'[\s\S]*?'closed'/, '只有悬停呼出的面板允许因鼠标离开而收回')
assert.match(desktopNavigationControllerSource, /current\s*===\s*'click'[\s\S]*?'closed'\s*:\s*'click'/, '点击呼出的面板必须保持打开，直到再次点击或明确关闭')
assert.match(desktopNavigationControllerSource, /toggleDesktopNavigation[\s\S]*?persistentDesktopNavigation[\s\S]*?navigationBehavior:\s*'auto-hide'/, '统一入口必须能把常驻左栏收回为自动隐藏状态')
assert.match(shellSource, /transition-\[margin\]/, '左栏展开与收起时正文边距必须平滑过渡')
assert.match(mainOpeningSource, /desktopNavigationExpanded[\s\S]*?lg:ml-\[var\(--mes-desktop-sidebar-width\)\][\s\S]*?xl:ml-\[var\(--mes-desktop-split-sidebar-width\)\]/, '正文必须按排除平台总览后的侧栏状态，使用与面板相同的普通及双列宽度')
assert.match(desktopNavigationControllerSource, /document\.addEventListener\('click', handleClick\)/, '展开侧栏必须等正文点击完成再关闭，避免按下阶段位移吞掉原点击')
assert.doesNotMatch(desktopNavigationControllerSource, /document\.addEventListener\('pointerdown'/, '侧栏外部关闭不得在正文按钮按下阶段提前触发布局位移')
assert.match(shellSource, /固定导航|自动隐藏导航/, '左栏必须提供常驻与自动隐藏的显式切换')
assert.match(shellSource, /切换到画布工作布局|切换到标准管理布局/, '全局应用壳必须提供工作区形态切换按钮')
assert.match(desktopNavigationControllerSource, /useWorkspaceLayoutPreference/, '桌面导航控制器必须读取统一工作区偏好')
assert.match(desktopNavigationControllerSource, /navigationBehavior\s*===\s*'auto-hide'/, '桌面导航控制器必须实现左栏自动隐藏分支')
assert.match(desktopNavigationControllerSource, /desktopSidebarStorageKey/, '桌面导航控制器必须保存标准侧栏宽度')
assert.match(desktopNavigationControllerSource, /desktopSplitSidebarStorageKey/, '桌面导航控制器必须保存双列侧栏宽度')
assert.match(desktopNavigationControllerSource, /pointermove/, '桌面导航控制器必须支持鼠标拖动调整宽度')
assert.match(desktopNavigationControllerSource, /ArrowLeft[\s\S]*?ArrowRight/, '桌面导航控制器必须支持键盘调整宽度')

assert.match(topNavigationSource, /groups:\s*NavigationGroup\[\]/, '顶部导航必须复用公共导航分组类型')
assert.match(topNavigationSource, /更多/, '顶部导航宽度不足时必须提供单行溢出菜单')
assert.doesNotMatch(topNavigationSource, /flex-wrap/, '画布工作的顶部导航不得换行')
assert.doesNotMatch(topNavigationSource, /ChevronDown|group\.icon/, '画布工作的顶部一级导航必须使用紧凑纯文字按钮，不显示文字图标或箭头')
assert.doesNotMatch(topNavigationSource, /onPointerEnter|onMouseEnter|scheduleGroupSwitch|HOVER_SWITCH_DELAY_MS/, '顶部一级菜单必须只响应点击，不得因鼠标经过打开或切换弹层')
assert.match(topNavigationSource, /panelTriggerRef[\s\S]*?getBoundingClientRect\(\)\.left\s*-\s*rootRect\.left/, '顶部二级菜单必须跟随触发入口定位')
assert.match(topNavigationSource, /COMPACT_PANEL_WIDTH_PX[\s\S]*?compactGroupPanel/, '少量功能的顶部二级菜单必须使用紧凑尺寸')
assert.match(topNavigationSource, /GROUP_PANEL_WIDTH_PX\s*=\s*384[\s\S]*?openPanel\.type\s*===\s*'group'/, '普通顶部二级菜单必须使用 384px 紧凑宽度，不得沿用聚合菜单宽度')
assert.match(topNavigationSource, /isOpenGroup[\s\S]*?bg-blue-600 text-white/, '当前打开的顶部一级菜单必须显示主高亮')
assert.match(topNavigationSource, /group\.active[\s\S]*?bg-blue-50 text-blue-700 ring-1/, '当前页面所属一级菜单必须使用区别于选择状态的稳定弱高亮')
assert.match(topNavigationSource, /showPanelHeading\s*=\s*openPanel\?\.type\s*===\s*'search'\s*\|\|\s*openPanel\?\.type\s*===\s*'more'/, '普通一级菜单弹层不得重复显示一级菜单名称')

assert.match(toolbarSource, /useWorkspaceLayoutPreference/, '公共页面工具必须读取工作区布局')
assert.match(toolbarSource, /layout\s*===\s*'canvas'/, '公共页面工具必须提供画布工作右侧呈现')
assert.match(toolbarSource, /页面工具/, '画布工作右侧栏必须保留公共页面工具语义')

assert.match(displaySettingsSource, /useWorkspaceLayoutPreference/, '显示设置必须读写工作区布局偏好')
assert.match(displaySettingsSource, /标准管理/, '显示设置必须提供标准管理布局')
assert.match(displaySettingsSource, /画布工作/, '显示设置必须提供画布工作布局')
assert.match(displaySettingsSource, /常驻显示/, '显示设置必须提供左栏常驻行为')
assert.match(displaySettingsSource, /自动隐藏/, '显示设置必须提供左栏自动隐藏行为')

console.log('工作区应用壳静态契约验证通过：独立平台入口、真实一级应用、平台无 MES 侧栏及左右布局同步过渡。')
