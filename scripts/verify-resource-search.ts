import assert from 'node:assert/strict'
import {
  filterByResourceSearch,
  matchesKeywordQuery,
  matchesKeywordValues,
  tokenizeKeywordQuery,
  type ResourceAdvancedSearchField,
  type ResourceSearchProfile,
} from '../lib/resource-search'

interface Item {
  code: string
  name: string
  status: 'ACTIVE' | 'ARCHIVED'
  qty: number
}

const items: Item[] = [
  { code: 'MAT-001', name: '主动轴 上海', status: 'ACTIVE', qty: 12 },
  { code: 'MAT-002', name: '从动齿轮 苏州', status: 'ARCHIVED', qty: 3 },
]

const profile: ResourceSearchProfile<Item> = {
  key: 'test',
  keywordFields: [
    { key: 'code', label: '编码', read: (item) => item.code },
    { key: 'name', label: '名称', read: (item) => item.name },
    { key: 'status', label: '状态', read: (item) => item.status },
  ],
}

const fields: readonly ResourceAdvancedSearchField<Item>[] = [
  { key: 'status', label: '状态', type: 'select', read: (item) => item.status },
  { key: 'qty', label: '数量', type: 'number', read: (item) => item.qty },
]

assert.deepEqual(tokenizeKeywordQuery(' 主动轴  上海 "MAT-001" '), ['主动轴', '上海', 'mat-001'])
assert.equal(matchesKeywordQuery(items[0], '主动轴 active', profile), true)
assert.equal(matchesKeywordQuery(items[0], '主动轴 archived', profile), false)
assert.equal(matchesKeywordValues('主动轴 MAT-001', [items[0].name, items[0].code]), true)
assert.equal(matchesKeywordValues('主动轴 苏州', [items[0].name, items[0].code]), false)
assert.equal(matchesKeywordValues('"主动轴 上海"', [items[0].name, items[0].code]), true)
assert.equal(matchesKeywordValues('"主动轴 MAT-001"', [items[0].name, items[0].code]), false)
assert.deepEqual(filterByResourceSearch(items, 'mat', profile, fields, [{ id: '1', field: 'status', operator: 'equals', value: 'ACTIVE' }]), [items[0]])
assert.deepEqual(filterByResourceSearch(items, '', profile, fields, [{ id: '2', field: 'qty', operator: 'lt', value: '5' }]), [items[1]])

console.log('resource search verification passed')
