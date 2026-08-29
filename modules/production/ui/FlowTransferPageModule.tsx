'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import TopBarPortal from '@/app/components/TopBarPortal'
import { appTextareaClassName } from '@/app/components/FormField'
import MetricCard from '@/app/components/MetricCard'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { resourceAdvancedFields, type ResourceSearchCondition } from '@/lib/resource-search'
import { BusinessDocumentPrintLink } from '@/modules/business-documents'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import { confirmFlowTransfer, loadFlowTransfers, reverseFlowTransfer, saveFlowTransfer } from '../client/flow-transfer-api'
import type {
  FlowTransferEmployeeOption,
  FlowTransferLocationOption,
  FlowTransferMaterialOption,
  FlowTransferRecord,
} from '../contracts/flow-transfer'
import {
  createEmptyFlowTransferForm,
  flowTransferFormError,
  flowTransferLocationLabel as locationLabel,
  flowTransferNumberText as numberText,
  flowTransferStatusMeta as statusMeta,
} from '../model/flow-transfer-view'
import { buildFlowTransferSearchCatalog } from '../model/production-search-fields'
import FlowTransferEntryDialog, { FlowTransferLocationMaterialCard } from './FlowTransferEntryDialog'

export default function FlowTransferPageModule({
  onMessage,
  canCreate,
  canUpdate,
  canConfirm,
  canReverse,
}: {
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
  canConfirm: boolean
  canReverse: boolean
}) {
  const [transfers, setTransfers] = useState<FlowTransferRecord[]>([])
  const [materials, setMaterials] = useState<FlowTransferMaterialOption[]>([])
  const [locations, setLocations] = useState<FlowTransferLocationOption[]>([])
  const [employees, setEmployees] = useState<FlowTransferEmployeeOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.flowTransfers.viewMode', 'card')
  const [editingTransfer, setEditingTransfer] = useState<FlowTransferRecord | null>(null)
  const [form, setForm] = useState(createEmptyFlowTransferForm)
  const [confirmingTransfer, setConfirmingTransfer] = useState<FlowTransferRecord | null>(null)
  const [reversingTransfer, setReversingTransfer] = useState<FlowTransferRecord | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const searchCatalog = useMemo(() => buildFlowTransferSearchCatalog(locations, employees), [employees, locations])
  const advancedSearchFields = useMemo(() => resourceAdvancedFields(searchCatalog), [searchCatalog])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (searchConditions.length > 0) params.set('advanced', JSON.stringify(searchConditions))
      const data = await loadFlowTransfers(params)
      setTransfers(data.transfers)
      setMaterials(data.materials)
      setLocations(data.locations)
      setEmployees(data.employees)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取流程转移记录失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage, searchConditions])

  useEffect(() => {
    const timer = window.setTimeout(loadData, 180)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const summary = useMemo(() => transfers.reduce((result, transfer) => {
    result[transfer.status.toLowerCase() as 'draft' | 'confirmed' | 'reversed'] += 1
    result.materialIds.add(transfer.material.id)
    return result
  }, { draft: 0, confirmed: 0, reversed: 0, materialIds: new Set<string>() }), [transfers])

  const transferSort = useClientTableSort(transfers, {
    transferNo: (transfer) => transfer.transferNo,
    material: (transfer) => `${transfer.material.code} ${transfer.material.name}`,
    source: (transfer) => locationLabel(transfer.sourceLocation),
    target: (transfer) => locationLabel(transfer.targetLocation),
    quantity: (transfer) => transfer.quantity,
    employee: (transfer) => transfer.employee ? `${transfer.employee.code} ${transfer.employee.name}` : transfer.operator,
    status: (transfer) => statusMeta[transfer.status].label,
    transferDate: (transfer) => new Date(transfer.transferDate),
  }, 'transferDate', 'desc')

  const openCreate = () => {
    setEditingTransfer(null)
    const defaultLocationId = locations.find((location) => location.isDefault)?.id || locations[0]?.id || ''
    setForm({ ...createEmptyFlowTransferForm(), sourceLocationId: defaultLocationId })
    setFormOpen(true)
  }

  const openEdit = (transfer: FlowTransferRecord) => {
    setEditingTransfer(transfer)
    setForm({
      transferDate: transfer.transferDate.slice(0, 10),
      materialId: transfer.material.id,
      sourceLocationId: transfer.sourceLocation.id,
      targetLocationId: transfer.targetLocation.id,
      quantity: Number(transfer.quantity),
      employeeId: transfer.employee?.isActive ? transfer.employee.id : '',
      note: transfer.note || '',
    })
    setFormOpen(true)
  }

  const saveDraft = async () => {
    const validationError = flowTransferFormError(form)
    if (validationError) return onMessage(validationError)

    setSaving(true)
    try {
      const result = await saveFlowTransfer(form, editingTransfer?.id)
      onMessage(result.message || '流程转移草稿已保存')
      setFormOpen(false)
      await loadData()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存流程转移失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmTransfer = async () => {
    if (!confirmingTransfer) return
    setSaving(true)
    try {
      const message = await confirmFlowTransfer(confirmingTransfer.id)
      onMessage(message || '流程转移已确认')
      setConfirmingTransfer(null)
      await loadData()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '确认流程转移失败')
    } finally {
      setSaving(false)
    }
  }

  const reverseTransfer = async () => {
    if (!reversingTransfer) return
    if (!reverseReason.trim()) return onMessage('请填写冲销原因')
    setSaving(true)
    try {
      const message = await reverseFlowTransfer(reversingTransfer.id, reverseReason.trim())
      onMessage(message || '流程转移已冲销')
      setReversingTransfer(null)
      setReverseReason('')
      await loadData()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '冲销流程转移失败')
    } finally {
      setSaving(false)
    }
  }

  const actions = (transfer: FlowTransferRecord) => (
    <div className="flex flex-wrap justify-end gap-2">
      <BusinessDocumentPrintLink kind="flow-transfer" id={transfer.id} />
      {transfer.status === 'DRAFT' && (
        <>
          {canUpdate && <AppButton size="sm" onClick={() => openEdit(transfer)}>编辑</AppButton>}
          {canConfirm && <AppButton size="sm" variant="create" onClick={() => setConfirmingTransfer(transfer)}>确认移库</AppButton>}
        </>
      )}
      {canReverse && transfer.status === 'CONFIRMED' && (
        <AppButton size="sm" variant="danger" onClick={() => {
          setReversingTransfer(transfer)
          setReverseReason('')
        }}>冲销</AppButton>
      )}
    </div>
  )

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.flowTransfers"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索转移单号、物料、操作人或备注"
              conditions={searchConditions}
              onConditionsChange={setSearchConditions}
            />
          )}
          advancedSearch={<ResourceAdvancedSearch fields={advancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={canCreate ? <AppButton variant="create" onClick={openCreate}>新建流程转移</AppButton> : undefined}
        />
      </TopBarPortal>

      <div className="space-y-4">
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">流程转移</h2>
          <p className="mt-1 text-sm text-gray-500">同一物料、同一数量在不同库位或流程节点之间移动；不使用 BOM，不改变总库存和总成本。</p>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="已确认" value={summary.confirmed} compact />
            <MetricCard label="草稿" value={summary.draft} compact />
            <MetricCard label="已冲销" value={summary.reversed} tone="danger" compact />
            <MetricCard label="涉及物料" value={summary.materialIds.size} tone="primary" compact />
          </div>
        </section>

        {loading ? (
          <AppLoadingIndicator label="正在加载流程转移..." className="rounded-lg bg-white shadow-sm" />
        ) : transfers.length === 0 ? (
          <div className="rounded-lg bg-white py-16 text-center text-sm text-gray-500 shadow-sm">暂无流程转移记录</div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {transferSort.sortedRows.map((transfer) => {
              const meta = statusMeta[transfer.status]
              const material = materials.find((item) => item.id === transfer.material.id)
              return (
                <article key={transfer.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-blue-700">{transfer.transferNo}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      </div>
                      <div className="mt-2 font-semibold text-gray-900">{transfer.material.name}</div>
                      <div className="font-mono text-xs text-gray-500">{transfer.material.code}</div>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <div>{new Date(transfer.transferDate).toLocaleDateString('zh-CN')}</div>
                      <div className="mt-1 text-xs">{transfer.operator}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-gray-50 p-3">
                    <FlowTransferLocationMaterialCard label="来源" material={material || transfer.material} location={transfer.sourceLocation} />
                    <div className="text-center text-blue-700">
                      <div className="text-lg">→</div>
                      <div className="mt-1 whitespace-nowrap text-xs font-semibold">{numberText(transfer.quantity)} {transfer.unit}</div>
                    </div>
                    <FlowTransferLocationMaterialCard label="目标" material={material || transfer.material} location={transfer.targetLocation} />
                  </div>
                  {transfer.note && <div className="mt-3 text-sm text-gray-500">{transfer.note}</div>}
                  {transfer.status === 'REVERSED' && transfer.reverseReason && (
                    <div className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">冲销原因：{transfer.reverseReason}</div>
                  )}
                  <div className="mt-4 border-t border-gray-100 pt-3">{actions(transfer)}</div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <SortableTableHeader column="transferNo" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>转移单号</SortableTableHeader>
                  <SortableTableHeader column="material" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>物料</SortableTableHeader>
                  <SortableTableHeader column="source" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>来源库位</SortableTableHeader>
                  <SortableTableHeader column="target" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>目标库位</SortableTableHeader>
                  <SortableTableHeader column="quantity" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>数量</SortableTableHeader>
                  <SortableTableHeader column="employee" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>操作员工</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>状态</SortableTableHeader>
                  <SortableTableHeader column="transferDate" activeColumn={transferSort.sortColumn} direction={transferSort.sortDirection} onSort={transferSort.toggleSort}>转移日期</SortableTableHeader>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transferSort.sortedRows.map((transfer) => {
                  const meta = statusMeta[transfer.status]
                  return (
                    <tr key={transfer.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-700">{transfer.transferNo}</td>
                      <td className="px-4 py-3"><div className="font-medium text-gray-900">{transfer.material.name}</div><div className="font-mono text-xs text-gray-500">{transfer.material.code}</div></td>
                      <td className="px-4 py-3 text-gray-700">{locationLabel(transfer.sourceLocation)}</td>
                      <td className="px-4 py-3 text-gray-700">{locationLabel(transfer.targetLocation)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{numberText(transfer.quantity)} {transfer.unit}</td>
                      <td className="px-4 py-3 text-gray-700">{transfer.employee ? `${transfer.employee.code} · ${transfer.employee.name}` : transfer.operator}</td>
                      <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span></td>
                      <td className="px-4 py-3 text-gray-700">{new Date(transfer.transferDate).toLocaleDateString('zh-CN')}</td>
                      <td className="px-4 py-3">{actions(transfer)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <FlowTransferEntryDialog
          title={editingTransfer ? '编辑流程转移' : '新建流程转移'}
          form={form}
          materials={materials}
          locations={locations}
          employees={employees}
          saving={saving}
          confirmLabel={editingTransfer ? '保存流程转移' : '创建流程转移'}
          onChange={setForm}
          onCancel={() => setFormOpen(false)}
          onConfirm={saveDraft}
        />
      )}

      {confirmingTransfer && (
        <ModalDialog
          title="确认流程转移"
          onClose={() => setConfirmingTransfer(null)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setConfirmingTransfer(null)} onConfirm={confirmTransfer} confirmLabel="确认并移动库存" confirmVariant="create" busy={saving} />}
        >
          <p className="text-sm text-gray-600">将 {numberText(confirmingTransfer.quantity)} {confirmingTransfer.unit} {confirmingTransfer.material.code} 从“{locationLabel(confirmingTransfer.sourceLocation)}”转入“{locationLabel(confirmingTransfer.targetLocation)}”。</p>
          <p className="mt-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-800">物料和数量前后完全一致，总库存与总成本不变。</p>
        </ModalDialog>
      )}

      {reversingTransfer && (
        <ModalDialog
          title="冲销流程转移"
          onClose={() => setReversingTransfer(null)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setReversingTransfer(null)} onConfirm={reverseTransfer} confirmLabel="确认冲销" confirmVariant="danger" disabled={!reverseReason.trim()} busy={saving} />}
        >
          <p className="text-sm text-gray-600">系统将原转移数量从目标库位移回来源库位；如目标库位可用数量不足，冲销会被拒绝。</p>
          <textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} placeholder="填写冲销原因" className={`mt-4 ${appTextareaClassName}`} />
        </ModalDialog>
      )}
    </>
  )
}
