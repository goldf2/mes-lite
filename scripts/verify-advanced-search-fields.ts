import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildAdvancedSearchDraft,
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

const root = process.cwd()
const toolbarSource = readFileSync(join(root, 'app/components/ResponsiveToolbarActions.tsx'), 'utf8')
const resourcePageSource = readFileSync(join(root, 'app/components/resource/ResourcePage.tsx'), 'utf8')
const unifiedSearchPages = [
  'app/page.tsx',
  'app/components/BomOverviewPage.tsx',
  'app/components/DocumentCategorySettingsPage.tsx',
  'app/components/FlowTransferPage.tsx',
  'app/components/MaterialInPage.tsx',
  'app/components/MaterialPage.tsx',
  'app/components/PermissionPage.tsx',
  'app/components/ReturnPage.tsx',
  'app/components/SalesOrderPage.tsx',
  'app/components/ShipmentPage.tsx',
  'app/components/StatsPage.tsx',
  'app/components/SystemPage.tsx',
  'app/components/WorkInstructionPage.tsx',
  'app/components/WorkspacePages.tsx',
]

assert.doesNotMatch(toolbarSource, /hasLegacyAdvancedSearch|filterPresentation|filters\?: ReactNode/)
assert.match(resourcePageSource, /advancedSearchFields\?: readonly ResourceAdvancedSearchField<T>\[\]/)
assert.match(resourcePageSource, /filterByAdvancedSearch\(items, advancedSearchFields, searchConditions\)/)

for (const file of unifiedSearchPages) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(source, /advancedSearch=/, `${file} 必须把高级搜索接入公共工具栏`)
  assert.doesNotMatch(source, /\bfilters=\{/, `${file} 不得继续使用旧筛选内容作为高级搜索`)
}

console.log(`高级搜索字段表单验证通过：${unifiedSearchPages.length} 个搜索页面统一使用公共字段式高级搜索。`)
