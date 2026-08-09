import assert from 'node:assert/strict'
import {
  normalizeWorkspaceFunctionKeys,
  rankWorkspaceFunctionKeys,
} from '../lib/workspace'

assert.deepEqual(
  normalizeWorkspaceFunctionKeys(['stats', 'stats', 'unknown', 'materialIn']),
  ['materialIn'],
)

assert.deepEqual(
  normalizeWorkspaceFunctionKeys(['systemSettings', 'displaySettings']),
  ['businessSettings', 'displaySettings'],
)

const availableKeys = ['dashboard', 'materialIn', 'shipment', 'stocks', 'orders'] as const

assert.deepEqual(rankWorkspaceFunctionKeys({
  mode: 'DEFAULT',
  availableKeys: [...availableKeys],
  layout: [],
  pinned: [],
  usage: [],
}), ['dashboard', 'materialIn', 'shipment', 'stocks', 'orders'])

assert.equal(rankWorkspaceFunctionKeys({
  mode: 'DEFAULT',
  availableKeys: ['dashboard', 'materialIn', 'shipment', 'materialManagement', 'bomWorkspace', 'stocks', 'workInstructions', 'orders', 'bomUsage', 'return'],
  layout: [],
  pinned: [],
  usage: [],
}).length, 9)

assert.deepEqual(rankWorkspaceFunctionKeys({
  mode: 'CUSTOM',
  availableKeys: [...availableKeys],
  layout: ['orders', 'shipment'],
  pinned: [],
  usage: [],
}), ['orders', 'shipment'])

assert.deepEqual(rankWorkspaceFunctionKeys({
  mode: 'SMART',
  availableKeys: [...availableKeys],
  layout: [],
  pinned: ['stocks'],
  usage: [
    { functionKey: 'orders', useCount: 12, lastUsedAt: '2026-08-01T08:00:00.000Z' },
    { functionKey: 'shipment', useCount: 5, lastUsedAt: '2026-08-02T08:00:00.000Z' },
  ],
}), ['stocks', 'orders', 'shipment', 'dashboard', 'materialIn'])

console.log('工作台默认、智能与自定义排序验证通过')
