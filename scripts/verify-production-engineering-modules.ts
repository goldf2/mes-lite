import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const systemPage = read('app/components/SystemPage.tsx')
const moduleIndex = read('modules/production/index.ts')
const sectionPage = read('modules/production/ProductionEngineeringSectionPage.tsx')
const templatePage = read('modules/production/ui/ProcessTemplatePage.tsx')
const routePage = read('modules/production/ui/ProcessRoutePage.tsx')
const pageShell = read('modules/production/ui/ProductionEngineeringPageShell.tsx')
const client = read('modules/production/client/production-engineering-api.ts')
const model = read('modules/production/model/production-engineering.ts')

assert.match(systemPage, /from '@\/modules\/production'/, 'SystemPage 必须只通过 production 公开出口接入生产工程')
assert.doesNotMatch(systemPage, /ProcessTemplateManager|ProcessManager|processCostPerThousand|fetch\(/, '生产工程 UI、计算和请求不得回流 SystemPage')
assert.ok(systemPage.split('\n').length <= 40, 'SystemPage 必须保持纯领域分派层')
assert.match(moduleIndex, /ProductionEngineeringSectionPage/, 'production 模块必须公开生产工程分区页面')
assert.match(sectionPage, /processTemplates[\s\S]*process/, '生产工程分区必须拥有加工工艺和物料路线')
assert.match(sectionPage, /ConfigurationManualOrder/, '生产工程必须继续复用公共手工排序入口')

for (const [name, source] of [['加工工艺', templatePage], ['物料路线', routePage]] as const) {
  assert.match(source, /<ProductionEngineeringPageShell\b/, `${name}必须复用生产工程资源页壳`)
  assert.doesNotMatch(source, /fetch\(/, `${name} UI 必须通过模块 client 调用 API`)
  assert.match(source, /advancedFields=/, `${name}必须接入公共字段式高级搜索`)
}

assert.match(pageShell, /<ResourcePageShell\b/, '生产工程页壳必须复用公共 ResourcePageShell')
assert.match(pageShell, /<ResourceAdvancedSearch\b/, '生产工程页壳必须复用公共高级搜索')
assert.match(client, /\/api\/process-templates[\s\S]*\/api\/process-routes/, '生产工程 client 必须封装工艺与路线接口')
assert.match(model, /processCostPerThousand[\s\S]*processTemplateSearchProfile[\s\S]*processRouteSearchProfile/, '生产工程模型必须集中成本与搜索规则')

for (const path of [
  'modules/production/ui/ProcessTemplatePage.tsx',
  'modules/production/ui/ProcessRoutePage.tsx',
  'modules/production/model/production-engineering.ts',
  'modules/production/client/production-engineering-api.ts',
]) {
  assert.ok(read(path).split('\n').length <= 220, `${path} 超过 220 行，应继续拆分稳定职责`)
}

console.log(`生产工程模块校验通过：加工工艺、物料路线、成本模型和 API client 已归属 production，SystemPage ${systemPage.split('\n').length} 行。`)
