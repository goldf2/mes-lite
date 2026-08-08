import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pageModuleDefinitions, resolvePageModuleKey } from '../lib/page-modules'

const root = process.cwd()

const expectedFunctionKeys = [
  'dashboard', 'allFunctions', 'materialManagement', 'bomWorkspace', 'bomUsage', 'workInstructions',
  'equipment', 'orders', 'flowTransfers', 'dispatch', 'materialIn', 'salesOrders', 'shipment', 'return',
  'stocks', 'suppliers', 'customers', 'employees', 'locationSettings', 'unitSettings', 'workCenters',
  'documentCategories', 'processTemplates', 'processRoutes', 'businessSettings', 'displaySettings', 'aiSettings', 'sawingCost', 'scanPrint', 'archive', 'auditLogs',
  'dataTools', 'operators', 'permissionUsers', 'permissionGroups', 'create', 'detail',
]

const keys = pageModuleDefinitions.map((definition) => definition.key)
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
const missing = expectedFunctionKeys.filter((key) => !keys.includes(key))
const unexpected = keys.filter((key) => !expectedFunctionKeys.includes(key))
const expectedToolbarExceptions: string[] = []
const toolbarExceptions = pageModuleDefinitions.filter((definition) => definition.toolbar === 'none').map((definition) => definition.key)
const missingToolbarExceptions = expectedToolbarExceptions.filter((key) => !toolbarExceptions.includes(key))
const unexpectedToolbarExceptions = toolbarExceptions.filter((key) => !expectedToolbarExceptions.includes(key))

if (duplicates.length > 0 || missing.length > 0 || unexpected.length > 0
  || missingToolbarExceptions.length > 0 || unexpectedToolbarExceptions.length > 0) {
  throw new Error(JSON.stringify({
    duplicates,
    missing,
    unexpected,
    missingToolbarExceptions,
    unexpectedToolbarExceptions,
  }, null, 2))
}

const materialMappings = {
  materials: resolvePageModuleKey('materials', 'materials'),
  bomWorkspace: resolvePageModuleKey('materials', 'bomWorkspace'),
  bomUsage: resolvePageModuleKey('materials', 'bomUsage'),
}

if (materialMappings.materials !== 'materialManagement'
  || materialMappings.bomWorkspace !== 'bomWorkspace'
  || materialMappings.bomUsage !== 'bomUsage') {
  throw new Error(`物料模块映射错误：${JSON.stringify(materialMappings)}`)
}

const requiredToolbarCount = pageModuleDefinitions.filter((definition) => definition.toolbar === 'required').length

const materialPageSource = readFileSync(join(root, 'app/components/MaterialPage.tsx'), 'utf8')
const workInstructionPageSource = readFileSync(join(root, 'app/components/WorkInstructionPage.tsx'), 'utf8')
const pageAuditSource = readFileSync(join(root, 'docs/minierp/页面模块分类与接入清单.md'), 'utf8')
assert.doesNotMatch(materialPageSource, /repeat\(auto-fit/, '物料卡片不得在单条结果时拉伸占满整行')
assert.doesNotMatch(workInstructionPageSource, /repeat\(auto-fit/, '文档卡片不得在单条结果时拉伸占满整行')
assert.match(materialPageSource, /md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4/, '物料卡片必须使用最多四列的明确响应式网格')
assert.match(workInstructionPageSource, /md:grid-cols-2 2xl:grid-cols-3/, '文档卡片必须使用最多三列的明确响应式网格')

for (const key of expectedFunctionKeys) {
  assert.match(pageAuditSource, new RegExp('\\| `' + key + '` \\|'), `页面标准化审计缺少 ${key}`)
}
assert.match(pageAuditSource, /已标准化多视图：17 个/, '页面标准化审计的多视图统计必须保持同步')
assert.match(pageAuditSource, /应补多视图：2 个/, '页面标准化审计的待改造统计必须保持同步')
assert.match(pageAuditSource, /固定形态合理：18 个/, '页面标准化审计的固定形态统计必须保持同步')

console.log(`页面模块校验通过：${keys.length} 个页面入口，${new Set(pageModuleDefinitions.map((item) => item.kind)).size} 类公共骨架，${requiredToolbarCount} 个页面强制公共顶部工具栏，${toolbarExceptions.length} 个明确例外。`)
