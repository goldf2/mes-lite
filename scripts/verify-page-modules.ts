import { pageModuleDefinitions, resolvePageModuleKey } from '../lib/page-modules'

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
console.log(`页面模块校验通过：${keys.length} 个页面入口，${new Set(pageModuleDefinitions.map((item) => item.kind)).size} 类公共骨架，${requiredToolbarCount} 个页面强制公共顶部工具栏，${toolbarExceptions.length} 个明确例外。`)
