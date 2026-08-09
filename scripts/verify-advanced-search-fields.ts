import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildAdvancedSearchDraft,
  displayAdvancedSearchOptionValue,
  resolveAdvancedSearchOptionInput,
  type ResourceAdvancedSearchField,
} from '../lib/resource-search'

interface TestRow {
  title: string
  status: string
  version: string
}

const fields: readonly ResourceAdvancedSearchField<TestRow>[] = [
  { key: 'title', label: '文档标题', type: 'text', read: (row) => row.title },
  { key: 'status', label: '状态', type: 'select', read: (row) => row.status, options: [{ value: 'ACTIVE', label: '启用' }] },
  { key: 'version', label: '版本', type: 'text', read: (row) => row.version },
]

const draft = buildAdvancedSearchDraft(fields, [
  { id: 'saved-status', field: 'status', operator: 'equals', value: 'ACTIVE' },
])

assert.deepEqual(draft.map((condition) => condition.field), ['title', 'status', 'version'])
assert.equal(draft.find((condition) => condition.field === 'status')?.value, 'ACTIVE')
assert.equal(draft.find((condition) => condition.field === 'title')?.value, '')
assert.equal(draft.find((condition) => condition.field === 'version')?.operator, 'contains')
assert.equal(displayAdvancedSearchOptionValue(fields[1].options || [], 'ACTIVE'), '启用')
assert.equal(resolveAdvancedSearchOptionInput(fields[1].options || [], '启用'), 'ACTIVE')
assert.equal(resolveAdvancedSearchOptionInput(fields[1].options || [], '启'), '启')

const root = process.cwd()
const toolbarSource = readFileSync(join(root, 'app/components/ResponsiveToolbarActions.tsx'), 'utf8')
const resourcePageSource = readFileSync(join(root, 'app/components/resource/ResourcePage.tsx'), 'utf8')
const advancedSearchSource = readFileSync(join(root, 'app/components/resource/ResourceAdvancedSearch.tsx'), 'utf8')
const unifiedSearchPages = [
  'modules/bom/ui/BomOverviewPage.tsx',
  'app/components/FlowTransferPage.tsx',
  'modules/receiving/ui/MaterialInPage.tsx',
  'modules/materials/ui/MaterialWorkspaceToolbar.tsx',
  'modules/identity-access/ui/PermissionPageModule.tsx',
  'modules/sales/ui/ReturnPageModule.tsx',
  'modules/sales/ui/SalesOrderPageModule.tsx',
  'modules/sales/ui/ShipmentPageModule.tsx',
  'modules/documents/ui/WorkInstructionPage.tsx',
  'app/components/WorkspacePages.tsx',
  'modules/configuration/ui/DocumentCategorySettingsPage.tsx',
]
const resourceSearchPages = [
  'modules/configuration/ui/InventoryLocationSettingsPage.tsx',
  'modules/configuration/ui/PartySettingsPage.tsx',
  'modules/configuration/ui/UnitSettingsPage.tsx',
  'modules/configuration/ui/WorkCenterSettingsPage.tsx',
]
const productionEngineeringPages = [
  'modules/production/ui/ProcessTemplatePage.tsx',
  'modules/production/ui/ProcessRoutePage.tsx',
]

assert.doesNotMatch(toolbarSource, /hasLegacyAdvancedSearch|filterPresentation|filters\?: ReactNode/)
assert.match(resourcePageSource, /advancedSearchFields\?: readonly ResourceAdvancedSearchField<T>\[\]/)
assert.match(resourcePageSource, /filterByAdvancedSearch\(items, advancedSearchFields, searchConditions\)/)
assert.match(advancedSearchSource, /<datalist[\s\S]*?option\.label/, '预置搜索条件必须提供按标签联想的公共候选列表')
assert.match(advancedSearchSource, /resolveAdvancedSearchOptionInput/, '预置搜索条件必须允许手动输入并把完整标签映射到真实值')

for (const file of unifiedSearchPages) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(source, /advancedSearch=/, `${file} 必须把高级搜索接入公共工具栏`)
  assert.doesNotMatch(source, /\bfilters=\{/, `${file} 不得继续使用旧筛选内容作为高级搜索`)
}

for (const file of resourceSearchPages) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(source, /advancedSearchFields=/, `${file} 必须通过 ResourcePage 接入公共高级搜索`)
  assert.doesNotMatch(source, /\bfilters=\{/, `${file} 不得继续使用旧筛选内容作为高级搜索`)
}

for (const file of productionEngineeringPages) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(source, /advancedFields=/, `${file} 必须通过生产工程资源页壳接入公共高级搜索`)
  assert.doesNotMatch(source, /\bfilters=\{/, `${file} 不得继续使用旧筛选内容作为高级搜索`)
}

console.log(`高级搜索字段表单验证通过：${unifiedSearchPages.length + resourceSearchPages.length + productionEngineeringPages.length} 个搜索页面统一使用公共字段式高级搜索。`)
