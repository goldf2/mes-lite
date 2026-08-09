import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function countRouteFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return total + countRouteFiles(fullPath)
    return total + (entry.name === 'route.ts' ? 1 : 0)
  }, 0)
}

function verifyMarkdownFileLinks(relativePath) {
  const sourcePath = path.join(rootDir, relativePath)
  const source = fs.readFileSync(sourcePath, 'utf8')
  const linkPattern = /\]\(([^)]+\.md)(?:#[^)]+)?\)/g

  for (const match of source.matchAll(linkPattern)) {
    const target = decodeURIComponent(match[1])
    const targetPath = path.resolve(path.dirname(sourcePath), target)
    assert(fs.existsSync(targetPath), `${relativePath} 存在失效链接：${match[1]}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const handbook = read('docs/开发文档.md')
const docsIndex = read('docs/README.md')
const pageMatrix = read('docs/architecture/功能页面权限接口矩阵.md')
const databaseArchitecture = read('docs/architecture/数据库结构.md')
const pageRegistry = read('lib/page-registry.ts')
const permissions = read('lib/permissions.ts')
const prismaSchema = read('prisma/schema.prisma')

const pageKeys = [...pageRegistry.matchAll(/registerPage\(\{\s*key: '([^']+)'/g)].map((match) => match[1])
const modelCount = [...prismaSchema.matchAll(/^model\s+\w+/gm)].length
const routeCount = countRouteFiles(path.join(rootDir, 'app/api'))
const verifyScriptCount = Object.keys(packageJson.scripts).filter((key) => key.startsWith('verify:')).length
const permissionBlock = permissions.match(/export const permissionResources = \[([\s\S]*?)\] as const/)?.[1] || ''
const permissionResourceCount = [...permissionBlock.matchAll(/\{ key: '[^']+'/g)].length

assert(handbook.includes(`事实基线：\`v${packageJson.version}\``), '开发手册版本基线与 package.json 不一致')
assert(handbook.includes(`统一页面注册表共有 **${pageKeys.length} 个页面模块定义**`), '开发手册页面模块数量已过期')
assert(handbook.includes(`包含 **${modelCount} 个数据模型**`), '开发手册 Prisma 模型数量已过期')
assert(handbook.includes(`当前有 ${routeCount} 个 \`app/api/**/route.ts\` 文件`), '开发手册 API 路由数量已过期')
assert(handbook.includes(`当前有 ${verifyScriptCount} 个 \`verify:*\` 命令`), '开发手册验证脚本数量已过期')
assert(handbook.includes(`当前运行时有 ${permissionResourceCount} 个权限资源`), '开发手册权限资源数量已过期')
assert(docsIndex.includes(`当前事实基线：\`v${packageJson.version}\``), '文档中心版本基线与 package.json 不一致')
assert(pageMatrix.includes(`版本：\`v${packageJson.version}\``), '功能页面权限接口矩阵版本基线与 package.json 不一致')
assert(databaseArchitecture.includes(`事实基线为 \`v${packageJson.version}\``), '数据库结构文档版本基线与 package.json 不一致')

for (const pageKey of pageKeys) {
  assert(pageMatrix.includes(`\`${pageKey}\``), `功能页面权限接口矩阵缺少页面键：${pageKey}`)
}

for (const relativePath of ['docs/README.md', 'docs/开发文档.md', 'docs/architecture/功能页面权限接口矩阵.md', 'docs/architecture/数据库结构.md']) {
  verifyMarkdownFileLinks(relativePath)
}

console.log(`开发文档校验通过：v${packageJson.version}，${pageKeys.length} 个页面，${modelCount} 个模型，${routeCount} 个 API，${permissionResourceCount} 个权限资源。`)
