import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadCustomerDirectory, loadCustomerMaster, loadCustomerMasterChoices, linkSharedCustomer, masterRecordManagementHref } from '../modules/configuration/client/customer-master-api'

const root = process.cwd()
const nativeRequire = createRequire(import.meta.url)
function renderUi(relative: string, states: unknown[], props: Record<string, unknown>) {
  const cache = new Map<string, { exports: Record<string, unknown> }>()
  let stateIndex = 0
  function load(filename: string): Record<string, unknown> {
    if (cache.has(filename)) return cache.get(filename)!.exports
    const fixtureModule = { exports: {} as Record<string, unknown> }
    cache.set(filename, fixtureModule)
    const compiled = transformSync(readFileSync(filename, 'utf8'), { loader: filename.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic', target: 'es2020' }).code
    const localRequire = (specifier: string): unknown => {
      if (specifier === 'react' && filename === join(root, relative)) return { ...React, useState: () => [states[stateIndex++], () => {}], useEffect: () => {} }
      if (specifier.endsWith('.css')) return {}
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const base = specifier.startsWith('@/') ? join(root, specifier.slice(2)) : resolve(dirname(filename), specifier)
        for (const suffix of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + suffix) && /\.(tsx?|jsx?)$/.test(base + suffix)) return load(base + suffix)
      }
      return nativeRequire(specifier)
    }
    new Function('module', 'exports', 'require', compiled)(fixtureModule, fixtureModule.exports, localRequire)
    return fixtureModule.exports
  }
  const Component = load(join(root, relative)).default as React.ComponentType<Record<string, unknown>>
  return renderToStaticMarkup(React.createElement(Component, props))
}

const enterprise = { id: 'enterprise-1', name: '合成客户', code: 'fixture', revision: 7 }
let checks = 0
async function main() {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ data: [{ id: 'local-1' }], customerMaster: { enabled: false, managementHref: null } })
    assert.equal(await loadCustomerMasterChoices('local-1'), null); checks++
    globalThis.fetch = async () => Response.json({ data: [{ id: 'local-1' }], customerMaster: { enabled: true, managementHref: null } })
    await assert.rejects(loadCustomerMasterChoices('local-1'), /尚未关联/); checks++
    globalThis.fetch = async () => Response.json({ data: [{ id: 'local-1', master: { enterpriseId: enterprise.id, status: 'unavailable' } }], customerMaster: { enabled: true } })
    await assert.rejects(loadCustomerMasterChoices('local-1'), /恢复后才能保存/); checks++
    const calls: string[] = []
    globalThis.fetch = async input => {
      calls.push(String(input))
      return String(input) === '/api/customers'
        ? Response.json({ data: [{ id: 'local-1', master: { enterpriseId: enterprise.id, status: 'current' } }], customerMaster: { enabled: true } })
        : Response.json({ records: [enterprise], managementHref: 'https://new.example.test/contacts/customer' })
    }
    assert.equal((await loadCustomerMasterChoices('local-1'))?.enterprise.revision, 7)
    assert.deepEqual(calls, ['/api/customers', '/api/customer-master/enterprises/enterprise-1']); checks++
    globalThis.fetch = async input => {
      const url = new URL(String(input), 'https://mes.example.test')
      assert.equal(url.pathname, '/api/customer-master/contacts')
      assert.equal(url.searchParams.get('q'), '第 121 位')
      assert.equal(url.searchParams.get('offset'), '120')
      return Response.json({ records: [{ id: 'contact-121' }], page: { hasMore: true, total: 145, offset: 120, limit: 20 } })
    }
    assert.equal((await loadCustomerMaster('contacts', new URLSearchParams({ enterpriseId: 'enterprise-1', q: '第 121 位', offset: '120', limit: '20' }))).page.total, 145); checks++
    globalThis.fetch = async (input, init) => {
      assert.equal(input, '/api/customers/master-link')
      assert.deepEqual(JSON.parse(String(init?.body)), { enterpriseId: 'enterprise-1', expectedRevision: 7, customerId: 'local-1' })
      return Response.json({ data: { customerId: 'local-1' } })
    }
    assert.equal((await linkSharedCustomer('enterprise-1', 7, 'local-1')).customerId, 'local-1'); checks++
    globalThis.fetch = async () => Response.json({ error: 'CUSTOMER_MASTER_REVISION_CONFLICT' }, { status: 409 })
    await assert.rejects(linkSharedCustomer('enterprise-1', 7), /重新确认/); checks++
    globalThis.fetch = async () => Response.json({ error: 'private backend response' }, { status: 503 })
    await assert.rejects(loadCustomerDirectory(), /客户资料读取失败/); checks++
  } finally { globalThis.fetch = previous }
  assert.equal(masterRecordManagementHref('https://changed.example.test/platform/contacts/', 'contact:1'), 'https://changed.example.test/platform/contacts/contact%3A1')
  assert.equal(masterRecordManagementHref(undefined, 'contact-1'), undefined); checks++

  const noOp = () => {}
  const pickerProps = { customerId: 'local-1', value: {}, onChange: noOp }
  const pickerFile = 'modules/configuration/ui/CustomerMasterSelectionFields.tsx'
  const choices = ['', 0, [], null, 145, true, false, '', 0]
  const picker = renderUi(pickerFile, [enterprise, false, '', 0, true, true, false, ...choices, ...choices], pickerProps)
  assert.match(picker, /本单不指定联系人/)
  assert.match(picker, /本单不指定收货地点/)
  assert.match(picker, /共 145 项/)
  assert.match(picker, /下一页/)
  assert.doesNotMatch(picker, /使用主档主要/); checks++
  const errorPicker = renderUi(pickerFile, [null, false, '共享服务暂不可用', 0, false, false, false], pickerProps)
  assert.match(errorPicker, /role="alert"/)
  assert.match(errorPicker, /刷新资料/)
  assert.doesNotMatch(errorPicker, /role="combobox"/); checks++
  assert.equal(renderUi(pickerFile, [null, false, '', 0, false, false, true], pickerProps), ''); checks++
  const partyFile = 'modules/configuration/ui/PartySettingsPage.tsx'
  const legacy = { id: 'legacy-1', name: '旧客户标签', code: 'C1', contact: 'old-private-contact', phone: 'old-private-phone', address: 'old-private-address', sortOrder: 1, createdAt: '2026-10-18T00:00:00Z' }
  const partyProps = { kind: 'customer', onMessage: noOp, canCreate: true, canUpdate: true, canDelete: true }
  const partyStates = (sharedMode: boolean | null) => [[legacy], '', null, {}, false, false, sharedMode, null, false]
  const sharedParty = renderUi(partyFile, partyStates(true), partyProps)
  assert.match(sharedParty, /待关联正式主档/)
  assert.match(sharedParty, /关联共享客户/)
  assert.doesNotMatch(sharedParty, /old-private|>编辑<|>归档<|新建客户/); checks++
  const localParty = renderUi(partyFile, partyStates(false), partyProps)
  assert.match(localParty, /old-private-contact/)
  assert.match(localParty, />编辑</)
  assert.doesNotMatch(localParty, /关联共享客户/); checks++
  const supplier = renderUi(partyFile, partyStates(true), { ...partyProps, kind: 'supplier' })
  assert.match(supplier, /old-private-contact/)
  assert.match(supplier, />编辑</)
  assert.doesNotMatch(supplier, /共享客户|待关联正式主档/); checks++
  console.log(`共享联系人 client/UI 验证通过：${checks} 组独立模式、未关联/不可用拒绝、分页搜索、显式绑定、动态管理地址、空选择及错误状态；仅使用合成数据。`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
