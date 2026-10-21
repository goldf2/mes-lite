'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import { appSelectClassName } from '@/app/components/FormField'
import { ResourcePage } from '@/app/components/resource'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { loadWarehousePackage, loadWarehousePackages, prepareWarehousePackageLabel } from '../client/warehouse-package-api'
import type { WarehousePackage, WarehousePackageLabelRevision, WarehousePackageList } from '../contracts/warehouse-package'
import { warehousePackageLabelData, warehousePackageStatusLabel } from '../model/warehouse-package-view'
import WarehousePackageCreateDialog from './WarehousePackageCreateDialog'
import WarehousePackageDetailPanel from './WarehousePackageDetailPanel'

export default function WarehousePackagePageModule({ canManage, canPrint, canReadAttachments, canManageAttachments, renderLabelDialog, renderAttachments, onMessage }: {
  canManage: boolean
  canPrint: boolean
  canReadAttachments: boolean
  canManageAttachments: boolean
  onMessage: (message: string) => void
  renderLabelDialog: (request: { id: string; data: NonNullable<WarehousePackageLabelRevision['payload']>; onClose: () => void; onMessage: (message: string) => void }) => ReactNode
  renderAttachments?: (request: { id: string; readOnly: boolean }) => ReactNode
}) {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<WarehousePackageList>({ items: [], total: 0, page: 1, pageSize: 30 })
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.warehousePackages.view', 'card')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<WarehousePackage | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [label, setLabel] = useState<{ id: string; data: NonNullable<WarehousePackageLabelRevision['payload']> } | null>(null)
  const listSequence = useRef(0)
  const detailSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++listSequence.current
    setLoading(true)
    setError('')
    try {
      const data = await loadWarehousePackages({ keyword, status, page, pageSize: 30 })
      if (sequence === listSequence.current) setResult(data)
    } catch (requestError) {
      if (sequence === listSequence.current) setError(requestError instanceof Error ? requestError.message : '加载装箱记录失败')
    } finally { if (sequence === listSequence.current) setLoading(false) }
  }, [keyword, page, status])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => { window.clearTimeout(timer); listSequence.current += 1 } }, [load])

  const select = useCallback(async (record: WarehousePackage) => {
    const sequence = ++detailSequence.current
    setSelected(record)
    try {
      const data = await loadWarehousePackage(record.id)
      if (sequence === detailSequence.current) setSelected(data)
    } catch (requestError) { if (sequence === detailSequence.current) onMessage(requestError instanceof Error ? requestError.message : '加载装箱详情失败') }
  }, [onMessage])

  useEffect(() => {
    const documentId = new URL(window.location.href).searchParams.get('document')
    if (!documentId) return
    const sequence = ++detailSequence.current
    void loadWarehousePackage(documentId).then((record) => { if (sequence === detailSequence.current) setSelected(record) }).catch((requestError) => { if (sequence === detailSequence.current) onMessage(requestError instanceof Error ? requestError.message : '加载扫码装箱记录失败') })
    return () => { detailSequence.current += 1 }
  }, [onMessage])

  const refresh = async () => {
    await load()
    if (selected) await select(selected)
  }

  const print = async () => {
    if (!selected || printing) return
    setPrinting(true)
    try {
      const revision = await prepareWarehousePackageLabel(selected.id)
      const record = { ...selected, labelRevision: revision }
      setSelected(record)
      setLabel({ id: record.id, data: revision.payload?.layout === 'packing' ? revision.payload : warehousePackageLabelData(record) })
    } catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '准备装箱标签失败') }
    finally { setPrinting(false) }
  }

  const quantityText = (record: WarehousePackage) => record.items.map((item) => `${item.quantity} ${item.unitSnapshot}`).join('；')
  return <>
    <ResourcePage resourceKey="warehousePackages" title="装箱记录" description="先装箱贴标，发货时选箱或扫码；也可继续散货发货。" items={result.items} getKey={(record) => record.id} selectedKey={selected?.id} onSelect={(record) => void select(record)} loading={loading} loadingLabel="正在加载装箱记录…" error={error} onRetry={() => void load()} emptyLabel="暂无装箱记录，可从已有可用库存新建装箱。" searchValue={keyword} onSearchChange={(value) => { setKeyword(value); setPage(1) }} searchPlaceholder="搜索装箱编号、产品或批次" viewMode={viewMode} onViewModeChange={setViewMode} displayModes={['list', 'card']} onCreate={canManage ? () => setCreateOpen(true) : undefined} createLabel="新建装箱记录" summary={`共 ${result.total} 箱`} rowLabel={(record) => `装箱记录 ${record.packageNo}`} actions={<>
      <select aria-label="装箱状态" className={`${appSelectClassName} !w-auto`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">全部状态</option><option value="PACKED">可发货</option><option value="RESERVED">待发占用</option><option value="SHIPPED">已发货</option><option value="VOIDED">已作废</option></select>
      <AppButton variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className="h-4 w-4" />刷新</AppButton>
      <AppButton variant="ghost" size="icon" aria-label="上一页" disabled={page <= 1 || loading} onClick={() => { setPage((value) => value - 1); setSelected(null) }}><ChevronLeft className="h-4 w-4" /></AppButton><span className="text-xs text-gray-500">{page} / {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><AppButton variant="ghost" size="icon" aria-label="下一页" disabled={page * result.pageSize >= result.total || loading} onClick={() => { setPage((value) => value + 1); setSelected(null) }}><ChevronRight className="h-4 w-4" /></AppButton>
    </>} columns={[
      { key: 'number', label: '装箱编号', render: (record) => <span className="font-mono font-semibold text-blue-700">{record.packageNo}</span> },
      { key: 'product', label: '产品', render: (record) => record.items.map((item) => <div key={item.id}><div>{item.material.code} · {item.material.name}</div><div className="text-xs text-gray-500">{item.material.spec || '规格未记录'} · {item.lotNoSnapshot}</div></div>) },
      { key: 'quantity', label: '数量', render: quantityText },
      { key: 'location', label: '库位', render: (record) => record.placement?.location.code || '未定位' },
      { key: 'status', label: '状态', render: (record) => warehousePackageStatusLabel[record.status] || record.status },
      { key: 'date', label: '包装日期', hideBelow: 'md', render: (record) => new Date(record.packedAt).toLocaleDateString('zh-CN') },
    ]} renderCard={({ item: record }) => <><div className="flex justify-between gap-2"><span className="font-mono font-semibold text-blue-700">{record.packageNo}</span><span className="text-xs text-gray-500">{warehousePackageStatusLabel[record.status] || record.status}</span></div><div className="mt-2 space-y-1">{record.items.map((item) => <div key={item.id}><div className="text-sm font-medium">{item.material.code} · {item.material.name}</div><div className="mt-1 text-xs text-gray-500">{item.material.spec || '规格未记录'} · {item.lotNoSnapshot}</div></div>)}</div><div className="mt-3 flex justify-between text-sm"><strong>{quantityText(record)}</strong><span className="text-gray-500">{record.placement?.location.code || '未定位'}</span></div><div className="mt-2 text-xs text-gray-500">{record.packedBy} · {new Date(record.packedAt).toLocaleDateString('zh-CN')}</div></>} detail={selected ? <WarehousePackageDetailPanel record={selected} canManage={canManage} canPrint={canPrint} attachments={canReadAttachments ? renderAttachments?.({ id: selected.id, readOnly: !canManageAttachments || !['PACKED', 'AVAILABLE'].includes(selected.status) || Boolean(selected.shipmentAllocation) }) : undefined} printing={printing} onPrint={() => void print()} onClose={() => { detailSequence.current += 1; setSelected(null) }} onChanged={refresh} onMessage={onMessage} /> : undefined} />
    {createOpen && <WarehousePackageCreateDialog onClose={() => setCreateOpen(false)} onCreated={async (record) => { await load(); await select(record) }} onMessage={onMessage} />}
    {label && renderLabelDialog({ id: label.id, data: label.data, onClose: () => setLabel(null), onMessage })}
  </>
}
