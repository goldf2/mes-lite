import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const sourceExtensions = new Set(['.ts', '.tsx'])
const failures: string[] = []

function toProjectPath(path: string) {
  return relative(root, path).split(sep).join('/')
}

function extension(path: string) {
  const index = path.lastIndexOf('.')
  return index >= 0 ? path.slice(index) : ''
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

function lineCount(path: string) {
  return readFileSync(path, 'utf8').split('\n').length - 1
}

const moduleDirectories = readdirSync(join(root, 'modules'))
  .filter((name) => statSync(join(root, 'modules', name)).isDirectory())

for (const moduleName of moduleDirectories) {
  if (!existsSync(join(root, 'modules', moduleName, 'index.ts'))) {
    failures.push(`modules/${moduleName} 缺少唯一公开出口 index.ts`)
  }
}

const moduleFiles = walk(join(root, 'modules')).filter((path) => sourceExtensions.has(extension(path)))
for (const path of moduleFiles) {
  const projectPath = toProjectPath(path)
  const sourceModule = projectPath.split('/')[1]
  const source = readFileSync(path, 'utf8')
  const moduleImportPattern = /(?:from\s+|import\()(['"])(@\/modules\/([^/'"]+)(\/[^'"]+)?)\1/g
  let match: RegExpExecArray | null
  while ((match = moduleImportPattern.exec(source)) !== null) {
    const targetModule = match[3]
    const internalPath = match[4]
    if (targetModule !== sourceModule && internalPath) {
      failures.push(`${projectPath} 越过 modules/${targetModule}/index.ts 导入 ${match[2]}`)
    }
  }

  if (projectPath.includes('/ui/')) {
    if (/@prisma\/client|@\/lib\/prisma|@\/modules\/[^/'"]+\/server|(?:\.\.\/)+server(?:\/|['"])/.test(source)) {
      failures.push(`${projectPath} 的 UI 层导入了 Prisma 或 server 内部实现`)
    }
  }
}

const frameworkDirectories = ['resource', 'relations', 'layout', 'navigation', 'page-modules']
for (const directory of frameworkDirectories) {
  for (const path of walk(join(root, 'app', 'components', directory)).filter((file) => sourceExtensions.has(extension(file)))) {
    if (/@\/modules\//.test(readFileSync(path, 'utf8'))) {
      failures.push(`${toProjectPath(path)} 是公共框架，不得反向导入业务模块`)
    }
  }
}

const legacyRootPages = new Set([
  'SawingCostCalculatorPage.tsx',
  'ScanPrintPage.tsx',
  'SystemPage.tsx',
])
const rootPages = readdirSync(join(root, 'app', 'components')).filter((name) => name.endsWith('Page.tsx'))
for (const page of rootPages) {
  if (!legacyRootPages.has(page)) failures.push(`app/components/${page} 是新增根级领域页面，应进入 modules/<domain>`)
}

const pageSizeBaselines: Record<string, number> = {
  'modules/receiving/ui/MaterialInPage.tsx': 800,
  'modules/documents/ui/WorkInstructionPage.tsx': 650,
}
const pageFiles = [
  ...walk(join(root, 'app', 'components')),
  ...walk(join(root, 'modules')),
].filter((path) => /(?:Page|PageModule)\.tsx$/.test(path))

for (const path of pageFiles) {
  const projectPath = toProjectPath(path)
  const lines = lineCount(path)
  const baseline = pageSizeBaselines[projectPath]
  if (lines > 800 && baseline === undefined) failures.push(`${projectPath} 新增为 ${lines} 行巨型页面，超过 800 行强制评审线`)
  if (baseline !== undefined && lines > baseline) failures.push(`${projectPath} 从 ${baseline} 行增长到 ${lines} 行；应先提取稳定职责`)
}

const routeSizeBaselines: Record<string, number> = {}
const routeFiles = walk(join(root, 'app', 'api')).filter((path) => path.endsWith('/route.ts'))
for (const path of routeFiles) {
  const projectPath = toProjectPath(path)
  const source = readFileSync(path, 'utf8')
  const lines = lineCount(path)
  const baseline = routeSizeBaselines[projectPath]
  if (lines > 300 && baseline === undefined) failures.push(`${projectPath} 新增为 ${lines} 行巨型路由，应把事务和规则迁入领域模块`)
  if (baseline !== undefined && lines > baseline) failures.push(`${projectPath} 从 ${baseline} 行增长到 ${lines} 行；路由不得继续承载领域规则`)
  if (/@\/modules\/[^/'"]+\/ui|@\/app\/components/.test(source)) failures.push(`${projectPath} 的 HTTP 适配层不得导入领域 UI 或应用组件`)
}

const systemPage = read('app/components/SystemPage.tsx')
assert.doesNotMatch(systemPage, /function (?:DataToolManager|RecycleBin|AuditLogViewer)\b/, '维护工具职责不得回流 SystemPage')
assert.match(systemPage, /from '@\/modules\/operations-tools'/, 'SystemPage 必须通过 operations-tools 公开出口挂载维护工具')
assert.doesNotMatch(systemPage, /function (?:SettingsManager|AiAgentSettings)\b/, '设置页职责不得回流 SystemPage')
assert.match(systemPage, /from '@\/modules\/system-settings'/, 'SystemPage 必须通过 system-settings 公开出口挂载系统设置')
assert.doesNotMatch(systemPage, /function (?:ProcessTemplateManager|ProcessManager)\b|processCostPerThousand|processRouteSearchProfile/, '生产工程职责不得回流 SystemPage')
assert.match(systemPage, /from '@\/modules\/production'/, 'SystemPage 必须通过 production 公开出口挂载生产工程页面')
assert.ok(systemPage.split('\n').length <= 40, 'SystemPage 必须保持为不超过 40 行的纯领域分派层')

if (failures.length > 0) {
  throw new Error(`模块边界验证失败：\n- ${failures.join('\n- ')}`)
}

const oversizedPages = pageFiles.filter((path) => lineCount(path) > 800).length
const oversizedRoutes = routeFiles.filter((path) => lineCount(path) > 300).length
console.log(`模块边界验证通过：${moduleDirectories.length} 个领域模块，${rootPages.length} 个存量根页面，${oversizedPages} 个存量巨型页面，${oversizedRoutes} 个存量巨型路由均未增长。`)
