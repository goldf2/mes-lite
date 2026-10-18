'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField from '@/app/components/FormField'
import SearchableSelect from '@/app/components/SearchableSelect'
import { loadCustomerMaster, loadCustomerMasterChoices } from '../client/customer-master-api'
import type { CustomerMasterSelection, MasterContact, MasterEnterprise, MasterLocation } from '../contracts/customer-master'

const pageSize = 20

type Choice = MasterContact | MasterLocation

function SharedRecordSelect({ resource, enterpriseId, value, onChange, onReady, disabled }: {
  resource: 'contacts' | 'locations'
  enterpriseId: string
  value: string | undefined
  onChange: (record: Choice | null) => void
  onReady: (ready: boolean) => void
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [records, setRecords] = useState<Choice[]>([])
  const [selected, setSelected] = useState<Choice | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const readyCallback = useRef(onReady)
  readyCallback.current = onReady
  const isContact = resource === 'contacts'
  const label = isContact ? '共享联系人' : '共享收货地点'

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setRecords([])
    readyCallback.current(false)
    void loadCustomerMaster(resource, new URLSearchParams({ enterpriseId, q: query, limit: String(pageSize), offset: String(offset) }), undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        setRecords(result.records as Choice[])
        setTotal(result.page.total)
        setHasMore(result.page.hasMore)
        readyCallback.current(true)
      })
      .catch(reason => {
        if (controller.signal.aborted) return
        setHasMore(false)
        setError(reason instanceof Error ? reason.message : '共享资料读取失败。')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [enterpriseId, resource, query, offset, reload])

  const search = useCallback((nextQuery: string) => {
    if (query === nextQuery) return
    setQuery(nextQuery)
    setOffset(0)
  }, [query])
  const available = selected && value === selected.id && !records.some(record => record.id === selected.id) ? [selected, ...records] : records
  const recordLabel = (record: Choice) => isContact
    ? `${record.name}${(record as MasterContact).phone ? ` · ${(record as MasterContact).phone}` : ''}`
    : `${record.name} · ${(record as MasterLocation).address || '未填写地址'}`

  return <div className="space-y-2">
    <FormField label={label}>
      <SearchableSelect
        value={value || ''}
        options={[
          { value: '', label: isContact ? '本单不指定联系人' : '本单不指定收货地点' },
          ...available.map(record => ({ value: record.id, label: recordLabel(record), keywords: isContact ? `${(record as MasterContact).email} ${(record as MasterContact).role}` : `${(record as MasterLocation).province} ${(record as MasterLocation).city}` })),
        ]}
        onSearch={search}
        onChange={id => {
          const record = available.find(item => item.id === id) || null
          setSelected(record)
          onChange(record)
        }}
        disabled={disabled || loading || Boolean(error)}
        placeholder={isContact ? '搜索并选择本次联系人' : '搜索并选择本次收货地点'}
        searchHint="搜索全部共享记录；下方可翻页"
        emptyText="暂无匹配记录，可更换关键词"
      />
    </FormField>
    {loading ? <p role="status" className="text-xs text-gray-500">正在读取{isContact ? '联系人' : '地点'}…</p> : error ? <div role="alert" className="flex items-center gap-2 text-xs text-amber-800"><span>{error}</span><AppButton size="sm" disabled={disabled} onClick={() => setReload(current => current + 1)}>重试</AppButton></div> : <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
      <span>{query ? `“${query}” · ` : ''}共 {total} 项 · 第 {Math.floor(offset / pageSize) + 1} 页</span>
      <div className="flex gap-2"><AppButton size="sm" disabled={disabled || offset === 0} onClick={() => setOffset(current => Math.max(0, current - pageSize))}>上一页</AppButton><AppButton size="sm" disabled={disabled || !hasMore} onClick={() => setOffset(current => current + pageSize)}>下一页</AppButton></div>
    </div>}
  </div>
}

export default function CustomerMasterSelectionFields({ customerId, value, onChange, onValidityChange, refreshKey = 0, disabled = false }: {
  customerId: string
  value: CustomerMasterSelection
  onChange: (selection: CustomerMasterSelection) => void
  onValidityChange?: (ready: boolean) => void
  refreshKey?: number
  disabled?: boolean
}) {
  const [enterprise, setEnterprise] = useState<MasterEnterprise | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [contactsReady, setContactsReady] = useState(false)
  const [locationsReady, setLocationsReady] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const callback = useRef(onChange)
  const validityCallback = useRef(onValidityChange)
  callback.current = onChange
  validityCallback.current = onValidityChange

  useEffect(() => {
    const controller = new AbortController()
    setEnterprise(null)
    setMessage('')
    setContactsReady(false)
    setLocationsReady(false)
    setLocalMode(false)
    setLoading(Boolean(customerId))
    validityCallback.current?.(false)
    callback.current({ customerMasterContactId: undefined, customerMasterLocationId: undefined, customerMasterRevision: undefined, customerMasterContactRevision: undefined, customerMasterLocationRevision: undefined })
    if (!customerId) return () => controller.abort()
    void loadCustomerMasterChoices(customerId, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        if (!result) {
          setLocalMode(true)
          return
        }
        setEnterprise(result.enterprise)
        callback.current({ customerMasterRevision: result.enterprise.revision })
      })
      .catch(error => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '共享客户资料读取失败。')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [customerId, reload, refreshKey])

  useEffect(() => {
    validityCallback.current?.(Boolean(customerId) && !loading && !message && (localMode || Boolean(enterprise && contactsReady && locationsReady)))
  }, [customerId, loading, message, localMode, enterprise, contactsReady, locationsReady])

  if (!customerId || localMode) return null
  return <section className="space-y-3 rounded-lg border border-teal-100 bg-teal-50/40 p-3 text-sm">
    <p className="text-gray-600">联系人和收货地点来自数据平台。本单保存此次选择的快照；以后修改主档不会改写历史单据。</p>
    {loading && <p role="status" className="text-gray-500">正在读取共享客户资料…</p>}
    {message && <div role="alert" className="flex flex-wrap items-center gap-2 text-amber-800"><p>{message}</p><AppButton size="sm" disabled={disabled} onClick={() => setReload(current => current + 1)}>刷新资料</AppButton></div>}
    {enterprise && <>
      <div className="flex items-center justify-between gap-2"><span className="font-medium">{enterprise.name}</span><AppButton size="sm" disabled={disabled} onClick={() => setReload(current => current + 1)}>刷新并重新选择</AppButton></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SharedRecordSelect key={`contacts-${enterprise.id}-${reload}-${refreshKey}`} resource="contacts" enterpriseId={enterprise.id} value={value.customerMasterContactId} onChange={record => onChange({ customerMasterContactId: record?.id, customerMasterContactRevision: record?.revision })} onReady={setContactsReady} disabled={disabled} />
        <SharedRecordSelect key={`locations-${enterprise.id}-${reload}-${refreshKey}`} resource="locations" enterpriseId={enterprise.id} value={value.customerMasterLocationId} onChange={record => onChange({ customerMasterLocationId: record?.id, customerMasterLocationRevision: record?.revision })} onReady={setLocationsReady} disabled={disabled} />
      </div>
    </>}
  </section>
}
