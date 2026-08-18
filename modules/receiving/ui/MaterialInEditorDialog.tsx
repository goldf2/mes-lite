'use client'

import type { Dispatch, SetStateAction } from 'react'
import AppButton from '@/app/components/AppButton'
import { DraftDocumentAttachmentPanel } from '@/modules/attachments'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import type { MaterialInPriceUnit } from '@/lib/material-in-quantity'
import type {
  InventoryLocationOption,
  MaterialInConversionHistory,
  MaterialInDraftItem,
  MaterialInFormState,
  MaterialInRecord,
  ReceivingMaterialOption,
  SupplierOption,
} from '../contracts/material-in'
import { formatReceivingMaterialLabel as formatMaterialLabel } from '../model/material-in-view'

interface MaterialInEditorDialogProps {
  open: boolean
  editingItem: MaterialInRecord | null
  form: MaterialInFormState
  setForm: Dispatch<SetStateAction<MaterialInFormState>>
  loading: boolean
  draftAttachmentBusy: boolean
  draftAttachmentOwnerId: string
  draftItems: MaterialInDraftItem[]
  editingDraftItemId: string | null
  setDraftAttachmentBusy: Dispatch<SetStateAction<boolean>>
  suppliers: SupplierOption[]
  materials: ReceivingMaterialOption[]
  locations: InventoryLocationOption[]
  selectedMaterial?: ReceivingMaterialOption
  conversionHistory: MaterialInConversionHistory | null
  conversionHistoryLoading: boolean
  calculatedStockQty: number
  stockUnitLabel: string
  materialUsesDualUnit: boolean
  effectiveValuationQty: number
  valuationUnitLabel: string
  conversionSource: 'SAME_UNIT' | 'DOCUMENT_ACTUAL' | 'HISTORICAL_ESTIMATE' | 'MISSING'
  conversionRatePreview: number
  priceUnitOptions: MaterialInPriceUnit[]
  priceUsesValuation: boolean
  priceQuantity: number
  unitPricePreview: number
  totalAmountPreview: number
  stockUnitCostPreview: number
  valuationUnitCostPreview: number
  onClose: () => void
  onSubmit: () => void
  onSupplierSearch: (keyword?: string) => void | Promise<void>
  onMaterialSearch: (keyword?: string) => void | Promise<void>
  onMaterialChange: (material: ReceivingMaterialOption | null) => void
  onAddCurrentItem: () => void
  onCancelDraftItemEdit: () => void
  onEditDraftItem: (item: MaterialInDraftItem) => void
  onRemoveDraftItem: (id: string) => void
  onRecognized: (fields: Record<string, unknown>) => void
  onMessage: (message: string) => void
}

function conversionSourceLabel(source: MaterialInEditorDialogProps['conversionSource']) {
  if (source === 'DOCUMENT_ACTUAL') return '本批实测'
  if (source === 'HISTORICAL_ESTIMATE') return '历史实测加权推算'
  if (source === 'SAME_UNIT') return '与主单位相同'
  return '等待本批实测'
}

export default function MaterialInEditorDialog({
  open,
  editingItem,
  form,
  setForm,
  loading,
  draftAttachmentBusy,
  draftAttachmentOwnerId,
  draftItems,
  editingDraftItemId,
  setDraftAttachmentBusy,
  suppliers,
  materials,
  locations,
  selectedMaterial,
  conversionHistory,
  conversionHistoryLoading,
  calculatedStockQty,
  stockUnitLabel,
  materialUsesDualUnit,
  effectiveValuationQty,
  valuationUnitLabel,
  conversionSource,
  conversionRatePreview,
  priceUnitOptions,
  priceUsesValuation,
  priceQuantity,
  unitPricePreview,
  totalAmountPreview,
  stockUnitCostPreview,
  valuationUnitCostPreview,
  onClose,
  onSubmit,
  onSupplierSearch,
  onMaterialSearch,
  onMaterialChange,
  onAddCurrentItem,
  onCancelDraftItemEdit,
  onEditDraftItem,
  onRemoveDraftItem,
  onRecognized,
  onMessage,
}: MaterialInEditorDialogProps) {
  if (!open) return null
  const priceUnitLabel = priceUsesValuation ? valuationUnitLabel : stockUnitLabel
  const submitItemCount = draftItems.length + (form.materialId && !editingDraftItemId ? 1 : 0)

  return (
    <ModalDialog
      title={editingItem ? `编辑来料单 ${editingItem.inboundNo}` : '新建来料单'}
      description="一张来料单可添加多种物料；整单先进入同一待分库库位，后续通过流程转移完成分库。"
      onClose={onClose}
      closeDisabled={loading || draftAttachmentBusy}
      size="wide"
      overlayClassName="z-[60]"
      panelClassName="!max-w-[min(96vw,1500px)]"
      bodyClassName="xl:flex xl:overflow-hidden"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={onSubmit}
          confirmLabel={editingItem ? `保存 ${submitItemCount} 项` : `创建 ${submitItemCount} 项`}
          busy={loading || draftAttachmentBusy}
        />
      )}
    >
      <div className="min-h-0 w-full xl:grid xl:flex-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-5 xl:gap-4">
          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-700">凭据号</label>
            <input
              type="text"
              value={form.voucherNo}
              onChange={(event) => setForm({ ...form, voucherNo: event.target.value })}
              placeholder="外部单号、纸质单号或客户/供应商单号"
              className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-700">供应商</label>
            <SearchableSelect
              value={form.supplierId}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
                keywords: [supplier.code, supplier.contact, supplier.phone].filter(Boolean).join(' '),
                contact: supplier.contact,
                phone: supplier.phone,
              }))}
              onChange={(supplierId) => setForm((current) => ({ ...current, supplierId }))}
              onSearch={onSupplierSearch}
              allowClear
              placeholder="输入供应商名称、联系人或电话"
              emptyText="没有匹配供应商"
              searchHint="输入名称、编码、联系人或电话继续筛选"
              renderOption={(option) => (
                <>
                  <div className="truncate font-medium">{option.label}</div>
                  {(option.contact || option.phone) && (
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      {[option.contact, option.phone].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </>
              )}
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-700">物料</label>
            <SearchableSelect
              value={form.materialId}
              options={materials.map((material) => ({
                value: material.id,
                label: formatMaterialLabel(material),
                keywords: [material.code, material.name, material.spec].filter(Boolean).join(' '),
                code: material.code,
                name: material.name,
                spec: material.spec,
              }))}
              onChange={(materialId) => onMaterialChange(materials.find((material) => material.id === materialId) || null)}
              onSearch={onMaterialSearch}
              allowClear
              placeholder="输入物料名称、编码或规格"
              emptyText="没有匹配物料"
              searchHint="输入名称、编码或规格继续筛选"
              renderOption={(option) => (
                <>
                  <div className="truncate font-medium">{option.code as string} · {option.name as string}</div>
                  <div className="mt-0.5 truncate text-xs text-gray-500">{(option.spec as string) || '无规格'}</div>
                </>
              )}
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-700">待分库库位</label>
            <SearchableSelect
              value={form.locationId}
              onChange={(locationId) => setForm({ ...form, locationId })}
              options={locations.map((location) => ({
                value: location.id,
                label: `${location.code} · ${location.name}${location.isDefault ? '（默认）' : ''}`,
              }))}
              placeholder="整单统一进入默认待分库库位"
            />
          </div>

          {selectedMaterial && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 lg:col-span-7">
              <div className="mb-3">
                <div className="text-sm font-medium text-gray-800">来料实收数量</div>
                <div className="mt-0.5 text-xs text-gray-500">主单位数量必须实填；辅助单位优先实测，未填时仅可使用有效历史实测推算。</div>
              </div>
              <div className={`grid grid-cols-1 gap-4 ${materialUsesDualUnit ? 'sm:grid-cols-2' : ''}`}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">主单位实收量（{stockUnitLabel}）*</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={form.qty || ''}
                    onChange={(event) => setForm({ ...form, qty: Math.max(0, Number(event.target.value)) })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {materialUsesDualUnit && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">本批辅助单位实测量（{valuationUnitLabel}）</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={form.valuationQty || ''}
                      onChange={(event) => setForm({ ...form, valuationQty: Math.max(0, Number(event.target.value)) })}
                      placeholder={conversionHistory?.available ? '可留空并按历史实测推算' : '有效历史不足时必填'}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-blue-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>库存入账：<strong>{calculatedStockQty} {stockUnitLabel}</strong></span>
                  <span className="text-xs text-gray-500">辅助来源：{conversionSourceLabel(conversionSource)}</span>
                </div>
                {materialUsesDualUnit && (
                  <div className="mt-1 text-xs text-gray-600">
                    核算数量：{effectiveValuationQty || 0} {valuationUnitLabel}
                    {conversionSource === 'HISTORICAL_ESTIMATE' && conversionHistory?.rate
                      ? `（${conversionHistory.sampleCount} 批实测加权，1 ${stockUnitLabel} ≈ ${conversionHistory.rate} ${valuationUnitLabel}）`
                      : conversionSource === 'DOCUMENT_ACTUAL' && conversionRatePreview > 0
                        ? `（本批 1 ${stockUnitLabel} = ${conversionRatePreview} ${valuationUnitLabel}）`
                        : ''}
                  </div>
                )}
                {materialUsesDualUnit && form.valuationQty <= 0 && (
                  <div className={`mt-2 text-xs ${conversionHistory?.available ? 'text-amber-700' : 'text-red-600'}`}>
                    {conversionHistoryLoading
                      ? '正在读取历史实测数据…'
                      : conversionHistory?.available
                        ? '当前未填写辅助实测量，保存时将使用历史实测加权推算；推算值不会反向进入历史样本。'
                        : `当前只有 ${conversionHistory?.sampleCount || 0}/${conversionHistory?.minimumSamples || 3} 批有效实测，本批必须填写辅助单位实测量。`}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={`space-y-4 ${selectedMaterial ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3">
                <div className="text-sm font-medium text-gray-800">采购计价</div>
                <div className="mt-0.5 text-xs text-gray-500">单价或总价格任选一个修改，系统按主单位或辅助单位数量计算。</div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">单价</label>
                  <div className="flex rounded-lg border border-gray-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={unitPricePreview || ''}
                      onChange={(event) => setForm({
                        ...form,
                        unitPrice: Math.max(0, Number(event.target.value)),
                        priceInputMode: 'UNIT',
                      })}
                      className="min-w-0 flex-1 rounded-l-lg px-4 py-2 outline-none"
                    />
                    <select
                      aria-label="单价计量单位"
                      value={form.priceUnit}
                      onChange={(event) => setForm({ ...form, priceUnit: event.target.value as MaterialInPriceUnit })}
                      className="w-28 border-l border-gray-200 bg-gray-50 px-2 text-sm outline-none"
                    >
                      {priceUnitOptions.map((unit, index) => (
                        <option key={unit} value={unit}>元 / {index === 0 ? stockUnitLabel : valuationUnitLabel}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">总价格（元）</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={totalAmountPreview || ''}
                    onChange={(event) => setForm({
                      ...form,
                      totalAmount: Math.max(0, Number(event.target.value)),
                      priceInputMode: 'TOTAL',
                    })}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-blue-50 p-4 text-sm text-blue-900 sm:grid-cols-2">
              <div>计价数量：{priceQuantity || 0} {priceUnitLabel}</div>
              <div>单价：¥{unitPricePreview.toFixed(4)} / {priceUnitLabel}</div>
              <div>总价格：¥{totalAmountPreview.toFixed(2)}</div>
              <div>主单位成本：¥{stockUnitCostPreview.toFixed(4)} / {stockUnitLabel}</div>
              {materialUsesDualUnit && (
                <div>辅助单位成本：¥{valuationUnitCostPreview.toFixed(4)} / {valuationUnitLabel}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:col-span-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">批次号</label>
              <input
                type="text"
                value={form.batchNo}
                onChange={(event) => setForm({ ...form, batchNo: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">收货人</label>
              <input
                type="text"
                value={form.receivedBy}
                onChange={(event) => setForm({ ...form, receivedBy: event.target.value })}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="lg:col-span-8">
            <label className="mb-2 block text-sm font-medium text-gray-700">备注</label>
            <textarea
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {selectedMaterial && (
            <div className="flex justify-end gap-2 lg:col-span-12">
              {editingDraftItemId && (
                <AppButton variant="ghost" onClick={onCancelDraftItemEdit}>取消编辑</AppButton>
              )}
              <AppButton variant="secondary" onClick={onAddCurrentItem}>
                {editingDraftItemId ? '保存本项修改' : '添加本项并继续'}
              </AppButton>
            </div>
          )}
          {!editingItem && (
            <div className="lg:col-span-12">
              <DraftDocumentAttachmentPanel
                ownerType="MATERIAL_IN"
                draftOwnerId={draftAttachmentOwnerId}
                onRecognized={onRecognized}
                onBusyChange={setDraftAttachmentBusy}
                onMessage={onMessage}
              />
            </div>
          )}
        </div>

        <aside className="mt-5 border-t border-gray-200 pt-5 xl:mt-0 xl:flex xl:min-h-0 xl:flex-col xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <div className="flex items-center justify-between gap-3 bg-white pb-3 xl:shrink-0">
            <div className="text-sm font-semibold text-gray-900">本单已加入</div>
            <div className="text-xs tabular-nums text-gray-500">{draftItems.length} 项</div>
          </div>
          <div
            aria-label="本单已加入清单"
            className="mes-receipt-draft-scroll xl:min-h-0 xl:flex-1 xl:overflow-y-scroll xl:overscroll-contain xl:pr-2"
          >
            {draftItems.length === 0 ? (
              <div className="border-y border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">暂无已加入物料</div>
            ) : (
              <div className="border-t border-gray-200">
                {draftItems.map((item, index) => {
                  const material = materials.find((option) => option.id === item.materialId)
                  const location = locations.find((option) => option.id === item.locationId)
                  return (
                    <div
                      key={item.id}
                      className={`border-b py-3 text-sm ${editingDraftItemId === item.id ? 'border-blue-200 bg-blue-50/60' : 'border-gray-100'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="break-words font-medium text-gray-900">
                            {material ? formatMaterialLabel(material) : item.materialId}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {item.qty} {item.unit}
                            {item.valuationQty ? ` · 实测 ${item.valuationQty} ${item.valuationUnit}` : ''}
                            {' · '}¥{item.totalAmount.toFixed(2)}
                          </div>
                          <div className="mt-0.5 break-words text-xs text-gray-500">
                            统一待分库：{location ? `${location.code} · ${location.name}` : item.locationId}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditDraftItem(item)}
                            className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          >
                            {editingDraftItemId === item.id ? '编辑中' : '编辑'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveDraftItem(item.id)}
                            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm">
                  <span className="text-gray-500">已加入合计</span>
                  <strong className="tabular-nums text-gray-900">
                    ¥{draftItems.reduce((sum, item) => sum + item.totalAmount, 0).toFixed(2)}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </ModalDialog>
  )
}
