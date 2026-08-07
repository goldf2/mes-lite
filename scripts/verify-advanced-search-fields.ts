import assert from 'node:assert/strict'
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

console.log('高级搜索字段表单验证通过：全部字段固定列出，已有条件正确回填。')
