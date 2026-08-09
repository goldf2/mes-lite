import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const sourcePattern = /\.(?:ts|tsx)$/

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function projectPath(path: string) {
  return relative(root, path).split(sep).join('/')
}

function source(path: string) {
  return readFileSync(path, 'utf8')
}

const routeFiles = walk(join(root, 'app', 'api')).filter((path) => path.endsWith('/route.ts'))
const directPrismaRoutes = routeFiles.filter((path) => /@\/lib\/prisma|\bprisma\s*\.|\$transaction/.test(source(path)))
assert.deepEqual(directPrismaRoutes.map(projectPath), [], 'Route Handler 不得直接访问 Prisma 或承载事务')

const uiFiles = [
  ...walk(join(root, 'app')).filter((path) => sourcePattern.test(path) && !path.includes(`${sep}api${sep}`)),
  ...walk(join(root, 'modules')).filter((path) => path.endsWith('.tsx')),
]
const directFetchUi = uiFiles.filter((path) => /\bfetch\s*\(/.test(source(path)))
assert.deepEqual(directFetchUi.map(projectPath), [], '页面、组件和 UI Hook 必须通过所属模块 client 访问 HTTP')

const allowedRootComponents = new Set([
  'AiAssistantAppearanceProvider.tsx', 'AiAssistantMark.tsx', 'AiAssistantPanel.tsx',
  'AppButton.tsx', 'AppLoadingIndicator.tsx', 'AuthGate.tsx', 'ControlTooltip.tsx',
  'FormField.tsx', 'FullscreenToggleButton.tsx', 'MetricCard.tsx', 'ModalDialog.tsx',
  'ModalOverlay.tsx', 'NumberInputField.tsx', 'PageQrCodeButton.tsx',
  'ResponsiveToolbarActions.tsx', 'SavedSearchPresets.tsx', 'SearchableSelect.tsx',
  'SortableTableHeader.tsx', 'StatusCheckboxFilter.tsx', 'SystemPage.tsx',
  'ToolbarOrderSettings.tsx', 'TopBarPortal.tsx', 'ViewModeToggle.tsx',
  'interfacePreferences.tsx', 'useClientTableSort.ts', 'useCompactViewport.ts',
  'useDismissibleSearchPopup.ts', 'useSearchPopupPlacement.ts',
])
const rootComponents = readdirSync(join(root, 'app', 'components')).filter((name) => statSync(join(root, 'app', 'components', name)).isFile())
assert.deepEqual(rootComponents.filter((name) => !allowedRootComponents.has(name)).sort(), [], 'app/components 根目录只允许应用壳和跨领域公共组件')

const pageFiles = [join(root, 'app', 'page.tsx'), ...walk(join(root, 'modules')).filter((path) => /(?:Page|PageModule)\.tsx$/.test(path))]
const oversizedPages = pageFiles.filter((path) => source(path).split('\n').length - 1 > 800)
assert.deepEqual(oversizedPages.map(projectPath), [], '页面协调层不得超过 800 行强制评审线')
assert.ok(source(join(root, 'app', 'page.tsx')).split('\n').length <= 20, 'app/page.tsx 必须保持薄入口')
assert.ok(source(join(root, 'app', 'components', 'SystemPage.tsx')).split('\n').length <= 40, 'SystemPage 必须保持薄分派层')

const oversizedRoutes = routeFiles.filter((path) => source(path).split('\n').length - 1 > 300)
assert.deepEqual(oversizedRoutes.map(projectPath), [], 'Route Handler 不得超过 300 行强制评审线')

const moduleDirectories = readdirSync(join(root, 'modules')).filter((name) => statSync(join(root, 'modules', name)).isDirectory())
for (const moduleName of moduleDirectories) {
  assert.ok(existsSync(join(root, 'modules', moduleName, 'index.ts')), `modules/${moduleName} 缺少公开入口`)
}

const tailwindConfig = source(join(root, 'tailwind.config.ts'))
assert.match(
  tailwindConfig,
  /['"]\.\/modules\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}['"]/,
  'Tailwind 必须扫描 modules 目录，否则领域 UI 迁移后会丢失样式',
)

console.log(`结构目标验收通过：${moduleDirectories.length} 个模块、${routeFiles.length} 条薄 API、0 条路由直连 Prisma、0 个 UI 直接请求、0 个超限页面/路由。`)
