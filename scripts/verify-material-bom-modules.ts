import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
const materialsIndex = read('modules/materials/index.ts')
const materialPage = read('modules/materials/ui/MaterialPage.tsx')
const materialClient = read('modules/materials/client/materials-api.ts')
const materialContracts = read('modules/materials/contracts/material.ts')
const bomIndex = read('modules/bom/index.ts')
const bomOverview = read('modules/bom/ui/BomOverviewPage.tsx')
const bomClient = read('modules/bom/client/bom-api.ts')
const bomContracts = read('modules/bom/contracts/bom.ts')

assert.equal(existsSync(join(root, 'app/components/MaterialPage.tsx')), false, '物料领域页面不得回流公共 components 根目录')
assert.equal(existsSync(join(root, 'app/components/MaterialPanoramaPage.tsx')), false, '物料全景页面不得回流公共 components 根目录')
assert.equal(existsSync(join(root, 'app/components/BomOverviewPage.tsx')), false, 'BOM 领域页面不得回流公共 components 根目录')

assert.match(registry, /import\('\@\/modules\/materials'\)/, '页面注册必须从 materials 模块公开出口加载')
assert.match(registry, /import\('\@\/modules\/bom'\)/, '页面注册必须从 bom 模块公开出口加载')
assert.match(materialsIndex, /from '\.\/ui\/MaterialPage'/, 'materials 模块必须拥有唯一页面公开出口')
assert.match(materialsIndex, /from '\.\/contracts'/, 'materials 模块必须通过公开出口暴露稳定契约')
assert.match(bomIndex, /from '\.\/ui\/BomOverviewPage'/, 'bom 模块必须拥有唯一页面公开出口')
assert.match(bomIndex, /from '\.\/contracts'/, 'bom 模块必须通过公开出口暴露稳定契约')

assert.match(materialPage, /from '\.\.\/client'/, '物料页面必须通过本模块 client 访问数据')
assert.match(materialPage, /from '\@\/modules\/bom'/, '物料页面调用 BOM 能力必须经过 bom 模块公开出口')
assert.doesNotMatch(materialPage, /fetch\(/, '物料页面 UI 不得直接发起 HTTP 请求')
assert.doesNotMatch(bomOverview, /fetch\(/, 'BOM 全览 UI 不得直接发起 HTTP 请求')
assert.match(materialClient, /fetch\('\/api\/materials/, '物料 HTTP 访问必须集中在 materials client')
assert.match(bomClient, /fetch\('\/api\/boms/, 'BOM HTTP 访问必须集中在 bom client')
assert.match(materialContracts, /export interface Material/, '物料数据结构必须集中为领域契约')
assert.match(bomContracts, /export interface BomVersion/, 'BOM 数据结构必须集中为领域契约')

assert.ok(materialPage.split('\n').length <= 3000, '物料页面已进入强制拆分阶段，不得再超过 3000 行')
assert.ok(bomOverview.split('\n').length <= 500, 'BOM 全览页面不得超过 500 行')

console.log('物料/BOM 模块边界验证通过：页面归属、公开出口、数据契约和 HTTP client 已分离。')
