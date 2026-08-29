'use client'

import Image from 'next/image'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import { appTextareaClassName } from '@/app/components/FormField'
import type {
  FlowTransferEmployeeOption,
  FlowTransferForm,
  FlowTransferLocationOption,
  FlowTransferMaterialOption,
} from '../contracts/flow-transfer'
import { flowTransferLocationLabel as locationLabel, flowTransferNumberText as numberText } from '../model/flow-transfer-view'

export default function FlowTransferEntryDialog({
  title,
  description = '输入与输出物料由系统固定为同一物料，数量严格 1:1',
  form,
  materials,
  locations,
  employees,
  saving,
  confirmLabel,
  materialLocked = false,
  sourceLocationLocked = false,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string
  description?: string
  form: FlowTransferForm
  materials: FlowTransferMaterialOption[]
  locations: FlowTransferLocationOption[]
  employees: FlowTransferEmployeeOption[]
  saving: boolean
  confirmLabel: string
  materialLocked?: boolean
  sourceLocationLocked?: boolean
  onChange: (form: FlowTransferForm) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const selectedMaterial = materials.find((material) => material.id === form.materialId) || null
  const sourceLocation = locations.find((location) => location.id === form.sourceLocationId) || null
  const targetLocation = locations.find((location) => location.id === form.targetLocationId) || null
  const sourceAvailable = selectedMaterial?.stock?.locationBalances.find(
    (balance) => balance.locationId === form.sourceLocationId,
  )?.availableQty || 0

  return (
    <ModalDialog
      title={title}
      description={description}
      onClose={onCancel}
      closeDisabled={saving}
      size="xl"
      footer={<ModalActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} busy={saving} />}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-700">
          转移日期
          <input type="date" value={form.transferDate} onChange={(event) => onChange({ ...form, transferDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700">
          操作员工
          <SearchableSelect
            value={form.employeeId}
            onChange={(employeeId) => onChange({ ...form, employeeId })}
            options={employees.map((employee) => ({
              value: employee.id,
              label: `${employee.code} · ${employee.name}${employee.department ? ` · ${employee.department}` : ''}`,
              keywords: `${employee.name} ${employee.department || ''}`,
            }))}
            placeholder="输入工号、姓名或部门筛选"
            className="mt-1"
          />
        </label>
        <label className="text-sm text-gray-700 md:col-span-2">
          转移物料
          <SearchableSelect
            value={form.materialId}
            onChange={(materialId) => onChange({ ...form, materialId })}
            options={materials.map((material) => ({
              value: material.id,
              label: `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`,
            }))}
            placeholder="输入物料编码、名称或规格筛选"
            className="mt-1"
            disabled={materialLocked}
          />
        </label>
        <label className="text-sm text-gray-700">
          来源库位
          <SearchableSelect
            value={form.sourceLocationId}
            onChange={(sourceLocationId) => onChange({ ...form, sourceLocationId })}
            options={locations.map((location) => ({ value: location.id, label: locationLabel(location) }))}
            placeholder="输入库位编码或名称筛选"
            className="mt-1"
            disabled={sourceLocationLocked}
          />
        </label>
        <label className="text-sm text-gray-700">
          目标库位
          <SearchableSelect
            value={form.targetLocationId}
            onChange={(targetLocationId) => onChange({ ...form, targetLocationId })}
            options={locations.map((location) => ({
              value: location.id,
              label: locationLabel(location),
              disabled: location.id === form.sourceLocationId,
            }))}
            placeholder="输入库位编码或名称筛选"
            className="mt-1"
          />
        </label>
      </div>

      {selectedMaterial && (
        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <div className="mb-2 text-xs font-medium text-blue-800">转移前后核对</div>
          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <FlowTransferLocationMaterialCard label="输入（来源）" material={selectedMaterial} location={sourceLocation} detail={`当前可用 ${numberText(sourceAvailable)} ${selectedMaterial.stockUnit || selectedMaterial.unit}`} large />
            <div className="text-center text-blue-700">
              <div className="font-medium">流程转移</div>
              <div className="mt-1 text-xl">→</div>
              <div className="mt-1 text-xs">同物料 · 同数量</div>
            </div>
            <FlowTransferLocationMaterialCard label="输出（目标）" material={selectedMaterial} location={targetLocation} detail="物料编码、名称、规格不变" large />
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-gray-700">
          转移数量
          <span className="mt-1 flex overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
            <input type="number" min="0" step="any" value={form.quantity || ''} onChange={(event) => onChange({ ...form, quantity: Math.max(0, Number(event.target.value)) })} className="min-w-0 flex-1 px-3 py-2 text-right outline-none" />
            <span className="flex items-center border-l border-gray-200 bg-gray-50 px-3 text-xs text-gray-600">{selectedMaterial?.stockUnit || selectedMaterial?.unit || '单位'}</span>
          </span>
          {selectedMaterial && form.sourceLocationId && form.quantity > sourceAvailable && (
            <span className="mt-1 block text-xs text-red-600">转移数量超过来源库位当前可用数量</span>
          )}
        </label>
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">确认后只移动库位余额；物料总库存、计价数量、总成本和成本层均不变。</div>
      </div>
      <label className="mt-5 block text-sm text-gray-700">
        备注
        <textarea rows={3} value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} className={`mt-1 ${appTextareaClassName}`} />
      </label>
    </ModalDialog>
  )
}

export function FlowTransferLocationMaterialCard({
  label,
  material,
  location,
  detail,
  large = false,
}: {
  label: string
  material: Pick<FlowTransferMaterialOption, 'code' | 'name' | 'spec'> & { primaryImage?: FlowTransferMaterialOption['primaryImage'] }
  location: Pick<FlowTransferLocationOption, 'code' | 'name'> | null
  detail?: string
  large?: boolean
}) {
  return (
    <div className={`min-w-0 rounded-lg border border-gray-100 bg-white ${large ? 'p-3' : 'p-2'}`}>
      <div className={`flex min-w-0 items-center ${large ? 'gap-3' : 'gap-2'}`}>
        {material.primaryImage ? (
          <Image
            src={material.primaryImage.thumbnailUrl || material.primaryImage.url}
            alt={material.primaryImage.note || material.name}
            width={64}
            height={64}
            unoptimized
            className={`${large ? 'h-16 w-16' : 'h-11 w-11'} shrink-0 rounded-lg border border-gray-100 object-cover`}
          />
        ) : (
          <div className={`${large ? 'h-16 w-16' : 'h-11 w-11'} flex shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400`}>暂无图片</div>
        )}
        <div className="min-w-0">
          <div className="text-xs text-gray-500">{label}</div>
          <div className="truncate font-mono text-xs text-gray-500">{material.code}</div>
          <div className="truncate text-sm font-medium text-gray-900">{material.name}{material.spec ? ` · ${material.spec}` : ''}</div>
        </div>
      </div>
      <div className="mt-2 truncate rounded bg-gray-50 px-2 py-1 text-xs text-blue-700">{location ? locationLabel(location) : '未选择库位'}</div>
      {detail && <div className="mt-1 text-xs text-gray-500">{detail}</div>}
    </div>
  )
}
