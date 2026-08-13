'use client'

import { type ReactNode, useCallback, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import useDismissibleSearchPopup from '@/app/components/useDismissibleSearchPopup'
import { bomEntryUnitOptions } from '@/lib/bom-entry-units'
import type { BomMaterialOption, BomUnitCatalogItem } from '../contracts'
import type { BomDraftController } from './useBomDraftController'

function materialOptionLabel(material: BomMaterialOption) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

function BomMaterialSelectSearch({
  value,
  materials,
  disabledIds,
  onChange,
}: {
  value: string
  materials: BomMaterialOption[]
  disabledIds: string[]
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const disabled = useMemo(() => new Set(disabledIds), [disabledIds])
  const selected = materials.find((material) => material.id === value)
  const keyword = query.trim().toLowerCase()
  const filtered = materials.filter((material) => {
    if (!keyword) return true
    return `${material.code} ${material.name} ${material.spec || ''} ${material.category}`.toLowerCase().includes(keyword)
  }).slice(0, 60)

  return (
    <div ref={rootRef} className="relative">
      <input
        value={open ? query : (selected ? materialOptionLabel(selected) : query)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePopup()
        }}
        placeholder="输入物料编码、名称或规格筛选"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">没有匹配物料</div>
          ) : filtered.map((material) => {
            const disabledOption = disabled.has(material.id)
            return (
              <button
                key={material.id}
                type="button"
                disabled={disabledOption}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(material.id)
                  closePopup()
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 ${value === material.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-gray-500">{material.code}</span>
                    <span className="ml-2">{material.name}</span>
                    {material.spec && <span className="ml-2 text-xs text-gray-500">{material.spec}</span>}
                  </span>
                  <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{material.stockUnit || material.unit}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BomQuantityEditor({
  label,
  value,
  unit,
  material,
  unitCatalog,
  onValueChange,
  onUnitChange,
}: {
  label: string
  value: number | string
  unit: string
  material: BomMaterialOption
  unitCatalog: BomUnitCatalogItem[]
  onValueChange: (value: string) => void
  onUnitChange: (unit: string) => void
}) {
  const unitOptions = bomEntryUnitOptions(unitCatalog, material)

  return (
    <label className="flex w-full min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
      <input
        aria-label={label}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="min-w-[5.5rem] flex-1 px-3 py-2 text-right text-sm outline-none"
      />
      {unitOptions.length > 0 ? (
        <select
          aria-label={`${label}单位`}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value)}
          className="min-w-[4.5rem] max-w-24 border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 outline-none"
        >
          {unitOptions.map((option) => (
            <option key={`${option.measureType}:${option.code}`} value={option.code}>{option.code}</option>
          ))}
        </select>
      ) : (
        <span className="flex min-w-10 items-center justify-center border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-600">
          {unit || material.stockUnit || material.unit}
        </span>
      )}
    </label>
  )
}

function BomMaterialIdentity({
  material,
  fallbackId,
  badge,
  onPreview,
}: {
  material?: BomMaterialOption
  fallbackId: string
  badge?: ReactNode
  onPreview: (material: BomMaterialOption) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {material?.primaryImage ? (
        <button
          type="button"
          onClick={() => onPreview(material)}
          title="放大查看物料图片"
          aria-label={`放大查看${material.name}图片`}
          className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <img
            src={material.primaryImage.thumbnailUrl || material.primaryImage.url}
            alt={material.primaryImage.note || material.name}
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-[10px] text-gray-400">
          无图
        </div>
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{material?.name || '未知物料'}</span>
          {badge}
        </div>
        <div className="truncate text-xs text-gray-500">{material?.code || fallbackId}{material?.spec ? ` · ${material.spec}` : ''}</div>
      </div>
    </div>
  )
}

export default function BomDraftEditor({
  controller,
  showSaveAction = false,
  permissions = { canCreate: true, canUpdate: true, canDelete: true },
}: {
  controller: BomDraftController
  showSaveAction?: boolean
  permissions?: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }
}) {
  const [previewMaterial, setPreviewMaterial] = useState<BomMaterialOption | null>(null)
  const {
    materialOptions,
    unitCatalog,
    materialById,
    selectedMaterialId,
    selectedMaterial,
    selectedBom,
    draftName,
    draftPurpose,
    primaryOutputQuantity,
    primaryOutputUnit,
    draftOutputs,
    draftItems,
    dirty,
    editable,
    saving,
  } = controller
  const canEditCurrent = selectedBom ? permissions.canUpdate : permissions.canCreate
  const outputOptions = useMemo(() => materialOptions.map((material) => ({
    value: material.id,
    label: materialOptionLabel(material),
    keywords: `${material.code} ${material.name} ${material.spec || ''} ${material.category}`,
  })), [materialOptions])

  return (
    <>
      <fieldset disabled={!editable || !canEditCurrent} className={`rounded-lg border border-gray-200 ${editable && canEditCurrent ? '' : 'bg-gray-50 opacity-80'}`}>
        <div className="grid grid-cols-1 divide-y divide-gray-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <section className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">输入</h4>
              <span className="text-xs text-gray-500">{draftItems.length} 项</span>
            </div>
            <BomMaterialSelectSearch
              value=""
              materials={materialOptions}
              disabledIds={[
                ...(selectedMaterialId ? [selectedMaterialId] : []),
                ...draftOutputs.map((output) => output.materialId),
                ...draftItems.map((item) => item.materialId),
              ]}
              onChange={controller.addInput}
            />
            <div className="mt-3 divide-y divide-gray-100">
              {draftItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">暂无投入物料</div>
              ) : draftItems.map((item) => {
                const material = materialById.get(item.materialId)
                return (
                  <div key={item.clientId} className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
                    <div className="col-span-2 min-w-0 2xl:col-span-1">
                      <BomMaterialIdentity material={material} fallbackId={item.materialId} onPreview={setPreviewMaterial} />
                    </div>
                    {material && (
                      <div className="min-w-0">
                        <BomQuantityEditor
                          label={`${material.name}每批投入数量`}
                          value={item.quantity}
                          unit={item.unit}
                          material={material}
                          unitCatalog={unitCatalog}
                          onValueChange={(quantity) => controller.updateInputQuantity(item.clientId, quantity)}
                          onUnitChange={(unit) => controller.changeInputUnit(item.clientId, unit)}
                        />
                      </div>
                    )}
                    <button type="button" onClick={() => controller.removeInput(item.clientId)} className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50">
                      移除
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">输出</h4>
              <span className="text-xs text-gray-500">{selectedMaterial ? 1 + draftOutputs.length : 0} 项</span>
            </div>
            <SearchableSelect
              value=""
              options={outputOptions.filter((option) => (
                option.value !== selectedMaterialId
                && !draftOutputs.some((output) => output.materialId === option.value)
                && !draftItems.some((item) => item.materialId === option.value)
              ))}
              onChange={controller.addOutput}
              placeholder={selectedMaterial ? '输入并选择下一项产出物料' : '输入并选择首项主产出物料'}
              emptyText="没有匹配的产出物料"
              className="w-full"
            />
            <div className="mt-3 divide-y divide-gray-100">
              {!selectedMaterial ? (
                <div className="py-8 text-center text-sm text-gray-400">暂无产出物料</div>
              ) : (
                <div className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
                  <div className="col-span-2 min-w-0 2xl:col-span-1">
                    <BomMaterialIdentity
                      material={selectedMaterial}
                      fallbackId={selectedMaterial.id}
                      badge={<span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">主产出</span>}
                      onPreview={setPreviewMaterial}
                    />
                  </div>
                  <div className="min-w-0">
                    <BomQuantityEditor
                      label={`${selectedMaterial.name}每批产出数量`}
                      value={primaryOutputQuantity}
                      unit={primaryOutputUnit}
                      material={selectedMaterial}
                      unitCatalog={unitCatalog}
                      onValueChange={controller.setPrimaryOutputQuantity}
                      onUnitChange={controller.changePrimaryOutputUnit}
                    />
                  </div>
                  <button type="button" onClick={controller.removePrimaryOutput} className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50">
                    移除
                  </button>
                </div>
              )}
              {draftOutputs.map((output) => {
                const material = materialById.get(output.materialId)
                return (
                  <div key={output.clientId} className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-2 py-3 2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto]">
                    <div className="col-span-2 min-w-0 2xl:col-span-1">
                      <BomMaterialIdentity material={material} fallbackId={output.materialId} onPreview={setPreviewMaterial} />
                    </div>
                    {material && (
                      <div className="min-w-0">
                        <BomQuantityEditor
                          label={`${material.name}每批产出数量`}
                          value={output.quantity}
                          unit={output.unit}
                          material={material}
                          unitCatalog={unitCatalog}
                          onValueChange={(quantity) => controller.updateOutputQuantity(output.clientId, quantity)}
                          onUnitChange={(unit) => controller.changeOutputUnit(output.clientId, unit)}
                        />
                      </div>
                    )}
                    <button type="button" onClick={() => controller.removeOutput(output.clientId)} className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50">
                      移除
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </fieldset>

      <div className="mt-4 flex flex-col gap-4 border-t border-gray-200 pt-4 lg:flex-row lg:items-end lg:justify-between">
        <fieldset disabled={!editable || !canEditCurrent} className="min-w-0 flex-1 lg:max-w-xl">
          <label className="block text-xs font-medium text-gray-700">
            BOM 方案名称
            <input
              value={draftName}
              onChange={(event) => controller.setDraftName(event.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="如：一模两件冲压方案"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="BOM 用途">
              {([['PRODUCTION', '生产 BOM'], ['PACKAGING', '包装 BOM']] as const).map(([purpose, label]) => (
                <button
                  key={purpose}
                  type="button"
                  aria-pressed={draftPurpose === purpose}
                  onClick={() => controller.setDraftPurpose(purpose)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${draftPurpose === purpose ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>草稿发布后自动成为该用途的默认 BOM</span>
            <span>{selectedBom ? `版本 ${selectedBom.version}` : '保存时自动生成版本'}</span>
            <span className={dirty ? 'font-medium text-amber-700' : 'text-gray-400'}>
              {dirty ? '有未保存修改' : '已保存'}
            </span>
          </div>
        </fieldset>
        {showSaveAction && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {editable && canEditCurrent && (
              <AppButton
                variant="primary"
                onClick={controller.save}
                disabled={saving || !selectedMaterial || !dirty}
                title={!selectedMaterial ? '请先添加产出物料' : !dirty ? '当前没有待保存修改' : undefined}
                className="px-6 py-2.5 font-semibold"
              >
                {saving ? '处理中...' : '保存草稿'}
              </AppButton>
            )}
            {permissions.canUpdate && selectedBom?.status === 'DRAFT' && (
              <AppButton
                variant="secondary"
                onClick={controller.release}
                disabled={saving || dirty}
                title={dirty ? '请先保存修改再发布' : '发布后生产订单才可引用'}
                className="px-5 py-2.5 font-semibold"
              >
                发布 BOM
              </AppButton>
            )}
            {permissions.canCreate && selectedBom && selectedBom.status !== 'DRAFT' && (
              <AppButton variant="primary" onClick={controller.copyVersion} disabled={saving} className="px-5 py-2.5 font-semibold">
                创建新版本
              </AppButton>
            )}
            {permissions.canDelete && selectedBom?.status === 'RELEASED' && (
              <AppButton
                variant="secondary"
                onClick={() => {
                  if (window.confirm(`确认作废 BOM ${selectedBom.version}？历史订单仍会保留其快照。`)) void controller.obsolete()
                }}
                disabled={saving}
                className="px-5 py-2.5 text-red-600"
              >
                作废版本
              </AppButton>
            )}
          </div>
        )}
      </div>

      {previewMaterial?.primaryImage && (
        <ModalDialog
          title={previewMaterial.name}
          description={[previewMaterial.code, previewMaterial.spec].filter(Boolean).join(' · ')}
          onClose={() => setPreviewMaterial(null)}
          size="wide"
          footer={<AppButton variant="primary" onClick={() => setPreviewMaterial(null)}>关闭</AppButton>}
        >
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-gray-50 p-3">
            <img
              src={previewMaterial.primaryImage.displayUrl || previewMaterial.primaryImage.url}
              alt={previewMaterial.primaryImage.note || previewMaterial.name}
              className="max-h-[70dvh] max-w-full object-contain"
            />
          </div>
        </ModalDialog>
      )}
    </>
  )
}
