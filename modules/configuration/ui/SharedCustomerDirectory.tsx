'use client'

import { useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import ModalDialog from '@/app/components/ModalDialog'
import type { MasterContact, MasterEnterprise, MasterLocation } from '../contracts/customer-master'
import { loadCustomerMaster, masterRecordManagementHref, linkSharedCustomer } from '../client/customer-master-api'

const pageSize = 20

function SharedCustomerDetails({ resource, enterpriseId }: { resource: 'contacts' | 'locations'; enterpriseId: string }) {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [records, setRecords] = useState<Array<MasterContact | MasterLocation>>([])
  const [managementHref, setManagementHref] = useState<string>()
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const isContact = resource === 'contacts'
  const label = isContact ? '联系人' : '地点与地址'

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setRecords([])
    void loadCustomerMaster(resource, new URLSearchParams({ enterpriseId, q: query, limit: String(pageSize), offset: String(offset) }), undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        setRecords(result.records as Array<MasterContact | MasterLocation>)
        setManagementHref(result.managementHref)
        setTotal(result.page.total)
        setHasMore(result.page.hasMore)
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取共享资料失败。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [resource, enterpriseId, query, offset, reload])

  return <section className="space-y-3">
    <FormField label={label}><input className={appInputClassName} aria-label={`搜索${label}`} value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} placeholder={isContact ? '搜索姓名、电话、邮箱或职务' : '搜索地点名称或地址'} /></FormField>
    {loading ? <p role="status" className="text-sm text-gray-500">正在读取{label}…</p> : error ? <div role="alert" className="flex items-center gap-2 text-sm text-amber-800"><span>{error}</span><AppButton size="sm" onClick={() => setReload(current => current + 1)}>重试</AppButton></div> : <>
      {records.length === 0 && <p className="text-sm text-gray-500">暂无符合条件的{label}。</p>}
      {records.map(record => {
        const href = masterRecordManagementHref(managementHref, record.id)
        return <div key={record.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm">
          <div className="min-w-0"><div className="font-medium">{record.name}</div><p className="mt-1 break-words text-gray-600">{isContact ? `${(record as MasterContact).phone || '未填电话'} · ${(record as MasterContact).email || '未填邮箱'} · ${(record as MasterContact).role || '未填职务'}` : `${(record as MasterLocation).address || '未填地址'} · ${(record as MasterLocation).coordinate ? '已定位' : '未定位'}`}</p></div>
          {href && <a className="shrink-0 text-blue-700 hover:underline" href={href} target="_blank" rel="noreferrer">维护</a>}
        </div>
      })}
    </>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><span>共 {total} 项 · 第 {Math.floor(offset / pageSize) + 1} 页</span><div className="flex gap-2"><AppButton size="sm" disabled={loading || offset === 0} onClick={() => setOffset(current => Math.max(0, current - pageSize))}>上一页</AppButton><AppButton size="sm" disabled={loading || Boolean(error) || !hasMore} onClick={() => setOffset(current => current + pageSize)}>下一页</AppButton></div></div>
  </section>
}

export default function SharedCustomerDirectory({ customerId, enterpriseId, canLink, onLinked, onMessage }: {
  customerId?: string
  enterpriseId?: string
  canLink: boolean
  onLinked: () => void
  onMessage: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [records, setRecords] = useState<MasterEnterprise[]>([])
  const [selected, setSelected] = useState<MasterEnterprise | null>(null)
  const [managementHref, setManagementHref] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setLinkError('')
    setRecords([])
    setSelected(null)
    void loadCustomerMaster('enterprises', new URLSearchParams({ q: query, limit: String(pageSize), offset: String(offset) }), enterpriseId, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        const enterprises = result.records as MasterEnterprise[]
        setRecords(enterprises)
        setManagementHref(result.managementHref)
        setHasMore(result.page.hasMore)
        setTotal(result.page.total)
        if (enterpriseId) setSelected(enterprises[0] || null)
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取共享客户失败。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, query, offset, enterpriseId, reload])

  const link = async (record: MasterEnterprise) => {
    setLinking(true)
    setLinkError('')
    try {
      await linkSharedCustomer(record.id, record.revision, customerId)
      onMessage(customerId ? '已关联共享客户，资料统一在数据平台维护。' : '此共享客户已用于 MES。')
      setOpen(false)
      onLinked()
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : '关联未完成，请刷新资料后重试。')
    } finally { setLinking(false) }
  }

  return <>
    <AppButton size="sm" onClick={() => { setQuery(''); setOffset(0); setOpen(true) }}>{enterpriseId ? '联系人与地点' : customerId ? '关联共享客户' : '共享客户'}</AppButton>
    {open && <ModalDialog onClose={() => setOpen(false)} closeDisabled={linking} title={enterpriseId ? '共享客户资料' : customerId ? '关联正式客户' : '共享客户'} size="xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">正式客户、联系人和地点由数据平台统一维护；这里可浏览资料并关联到 MES。</p>
        <div className="flex flex-wrap items-center justify-between gap-2">{managementHref && <a href={managementHref} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline">打开数据平台客户管理</a>}<AppButton size="sm" disabled={loading || linking} onClick={() => setReload(current => current + 1)}>刷新资料</AppButton></div>
        {!enterpriseId && <FormField label="搜索共享客户"><input disabled={linking} value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} className={appInputClassName} placeholder="搜索客户名称或编码" /></FormField>}
        {(error || linkError) && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error || linkError}</p>}
        {loading && <p role="status" className="text-sm text-gray-500">正在读取资料…</p>}
        {!loading && !error && records.length === 0 && <p className="text-sm text-gray-500">暂无符合条件的正式客户。</p>}
        <div className="space-y-2">{records.map(record => {
          const href = masterRecordManagementHref(managementHref, record.id)
          return <article key={record.id} className="rounded-lg border border-gray-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{record.name}</div><div className="text-xs text-gray-500">{record.code || '未填写编码'}</div></div><div className="flex flex-wrap gap-2"><AppButton size="sm" disabled={linking} onClick={() => setSelected(record)}>查看联系人与地点</AppButton>{!enterpriseId && canLink && <AppButton size="sm" disabled={linking || Boolean(linkError)} onClick={() => void link(record)}>{customerId ? '关联此客户' : '用于 MES'}</AppButton>}{href && <a href={href} target="_blank" rel="noreferrer" className="self-center text-sm text-blue-700 hover:underline">在数据平台维护</a>}</div></div></article>
        })}</div>
        {!enterpriseId && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><span>共 {total} 项 · 第 {Math.floor(offset / pageSize) + 1} 页</span><div className="flex gap-2"><AppButton size="sm" disabled={offset === 0 || loading || linking} onClick={() => setOffset(current => Math.max(0, current - pageSize))}>上一页</AppButton><AppButton size="sm" disabled={!hasMore || loading || linking || Boolean(error)} onClick={() => setOffset(current => current + pageSize)}>下一页</AppButton></div></div>}
        {selected && <section className="space-y-4 border-t border-gray-200 pt-4"><h3 className="font-semibold">{selected.name}</h3><div className="grid gap-5 md:grid-cols-2"><SharedCustomerDetails key={`contacts-${selected.id}-${reload}`} resource="contacts" enterpriseId={selected.id} /><SharedCustomerDetails key={`locations-${selected.id}-${reload}`} resource="locations" enterpriseId={selected.id} /></div></section>}
      </div>
    </ModalDialog>}
  </>
}
