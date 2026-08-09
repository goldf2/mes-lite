'use client'

import type { Dispatch, SetStateAction } from 'react'
import AppButton from '@/app/components/AppButton'
import { DraftDocumentAttachmentPanel } from '@/modules/attachments'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import type { MaterialInPriceUnit } from '@/lib/material-in-quantity'
import type {
  InventoryLocationOption,
  MaterialInDraftItem,
  MaterialInFormState,
  MaterialInRecord,
  ReceivingMaterialOption,
  SupplierOption,
} from '../contracts/material-in'
import {
  displayMaterialInPriceUnit as displayPriceUnit,
  formatReceivingMaterialLabel as formatMaterialLabel,
} from '../model/material-in-view'

interface MaterialInEditorDialogProps {
  open: boolean
  editingItem: MaterialInRecord | null
  form: MaterialInFormState
  setForm: Dispatch<SetStateAction<MaterialInFormState>>
  loading: boolean
  draftAttachmentBusy: boolean
  draftAttachmentOwnerId: string
  draftItems: MaterialInDraftItem[]
  setDraftItems: Dispatch<SetStateAction<MaterialInDraftItem[]>>
  setDraftAttachmentBusy: Dispatch<SetStateAction<boolean>>
  suppliers: SupplierOption[]
  materials: ReceivingMaterialOption[]
  locations: InventoryLocationOption[]
  selectedMaterial?: ReceivingMaterialOption
  linkedBatchRatios: { lengthPerPiece: number; weightPerLength: number } | null
  setLinkedBatchRatios: Dispatch<SetStateAction<{ lengthPerPiece: number; weightPerLength: number } | null>>
  isLengthMaterial: boolean
  calculatedStockQty: number
  calculatedTotalLength: number
  stockUnitLabel: string
  materialUsesDualUnit: boolean
  effectiveValuationQty: number
  valuationUnitLabel: string
  actualReferenceQty: number
  referenceValuationQty: number
  priceQuantity: number
  unitPricePreview: number
  totalAmountPreview: number
  stockUnitCostPreview: number
  valuationUnitCostPreview: number
  actualConversionRate: number
  onClose: () => void
  onSubmit: () => void
  onSupplierSearch: (keyword?: string) => void | Promise<void>
  onMaterialSearch: (keyword?: string) => void | Promise<void>
  onMaterialChange: (material: ReceivingMaterialOption | null) => void
  onUpdatePieceCount: (value: number) => void
  onUpdateTotalLength: (value: number) => void
  onUpdateTotalWeight: (value: number) => void
  onToggleBatchLink: () => void
  onAddCurrentItem: () => void
  onRecognized: (fields: Record<string, unknown>) => void
  onMessage: (message: string) => void
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
  setDraftItems,
  setDraftAttachmentBusy,
  suppliers,
  materials,
  locations,
  selectedMaterial,
  linkedBatchRatios,
  setLinkedBatchRatios,
  isLengthMaterial,
  calculatedStockQty,
  calculatedTotalLength,
  stockUnitLabel,
  materialUsesDualUnit,
  effectiveValuationQty,
  valuationUnitLabel,
  actualReferenceQty,
  referenceValuationQty,
  priceQuantity,
  unitPricePreview,
  totalAmountPreview,
  stockUnitCostPreview,
  valuationUnitCostPreview,
  actualConversionRate,
  onClose,
  onSubmit,
  onSupplierSearch,
  onMaterialSearch,
  onMaterialChange,
  onUpdatePieceCount,
  onUpdateTotalLength,
  onUpdateTotalWeight,
  onToggleBatchLink,
  onAddCurrentItem,
  onRecognized,
  onMessage,
}: MaterialInEditorDialogProps) {
  if (!open) return null

  const closeMaterialInForm = onClose
  const handleSubmit = onSubmit
  const fetchSuppliers = onSupplierSearch
  const fetchMaterials = onMaterialSearch
  const updateSelectedMaterial = onMaterialChange
  const updateLinkedPieceCount = onUpdatePieceCount
  const updateLinkedTotalLength = onUpdateTotalLength
  const updateLinkedTotalWeight = onUpdateTotalWeight
  const toggleBatchLink = onToggleBatchLink
  const addCurrentItem = onAddCurrentItem
  const applyRecognizedMaterialIn = onRecognized

  return (
<ModalDialog
  title={editingItem ? `编辑来料单 ${editingItem.inboundNo}` : '新建来料单'}
  description={editingItem ? '修改当前来料明细。' : '一张来料单可添加多种物料，每种物料分别记录数量、计价和库位。'}
  onClose={closeMaterialInForm}
  closeDisabled={loading || draftAttachmentBusy}
  size="wide"
  overlayClassName="z-[60]"
  panelClassName="!max-w-[min(96vw,1500px)]"
  bodyClassName="xl:overflow-hidden"
  footer={(
    <ModalActions
      onCancel={closeMaterialInForm}
      onConfirm={handleSubmit}
      confirmLabel={editingItem ? '保存并输出 PDF' : `创建 ${draftItems.length + (form.materialId ? 1 : 0)} 项并输出 PDF`}
      busy={loading || draftAttachmentBusy}
    />
  )}
>
  <div className={`min-h-0 ${editingItem ? '' : 'xl:grid xl:h-full xl:grid-cols-[minmax(0,1fr)_20rem]'}`}>
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-3 xl:gap-4 ${editingItem ? '' : 'xl:min-h-0 xl:overflow-y-auto xl:pr-5'}`}>
      <div className="lg:col-span-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">凭据号</label>
        <input
          type="text"
          value={form.voucherNo}
          onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
          placeholder="外部单号、纸质单号或客户/供应商单号"
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="lg:col-span-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">供应商</label>
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
          onSearch={fetchSuppliers}
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
        <label className="block text-sm font-medium text-gray-700 mb-2">物料</label>
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
          onChange={(materialId) => updateSelectedMaterial(materials.find((material) => material.id === materialId) || null)}
          onSearch={fetchMaterials}
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
        <label className="mb-2 block text-sm font-medium text-gray-700">收货库位</label>
        <SearchableSelect
          value={form.locationId}
          onChange={(locationId) => setForm({ ...form, locationId })}
          options={locations.map((location) => ({
            value: location.id,
            label: `${location.code} · ${location.name}${location.isDefault ? '（默认）' : ''}`,
          }))}
          placeholder="输入库位编码或名称筛选"
        />
      </div>
      {selectedMaterial && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-gray-800">来料实测</div>
              <div className="mt-0.5 text-xs text-gray-500">数量、长度和重量分别记录；库存只按物料主库存单位入账。</div>
            </div>
            {isLengthMaterial && (
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                {([
                  ['TOTAL', '总长度'],
                  ['PER_PIECE', '单件长度'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setLinkedBatchRatios(null)
                      setForm({ ...form, stockQtyMode: value })
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm ${form.stockQtyMode === value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                数量（件）{(isLengthMaterial || selectedMaterial.primaryMeasure === 'QUANTITY') ? ' *' : ''}
              </label>
              <input
                type="number"
                step="1"
                min={0}
                value={form.pieceCount || ''}
                onChange={(event) => updateLinkedPieceCount(Math.max(0, Math.floor(Number(event.target.value))))}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {isLengthMaterial && form.stockQtyMode === 'PER_PIECE' ? '单件长度' : '总长度'}（m）{isLengthMaterial ? ' *' : ''}
              </label>
              <input
                type="number"
                step="any"
                min={0}
                value={(isLengthMaterial ? form.stockQtyInput : form.totalLength) || ''}
                onChange={(event) => {
                  const value = Math.max(0, Number(event.target.value))
                  if (!isLengthMaterial) setForm({ ...form, totalLength: value })
                  else if (form.stockQtyMode === 'TOTAL') updateLinkedTotalLength(value)
                  else setForm({ ...form, stockQtyInput: value })
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                总重量（kg）{selectedMaterial.primaryMeasure === 'WEIGHT' ? ' *' : ''}
              </label>
              <input
                type="number"
                step="any"
                min={0}
                value={form.totalWeight || ''}
                onChange={(event) => updateLinkedTotalWeight(Math.max(0, Number(event.target.value)))}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {selectedMaterial.primaryMeasure === 'OTHER' && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">主单位总量（{stockUnitLabel}）*</label>
              <input
                type="number"
                step="any"
                min={0}
                value={form.qty || ''}
                onChange={(event) => setForm({ ...form, qty: Math.max(0, Number(event.target.value)) })}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div className="mt-3 rounded bg-white px-3 py-2 text-sm text-blue-900">
            库存入账：<strong>{calculatedStockQty} {stockUnitLabel}</strong>
            {isLengthMaterial && form.stockQtyMode === 'PER_PIECE' && (
              <span className="ml-2 text-xs text-gray-500">= {form.pieceCount || 0} 件 × {form.stockQtyInput || 0} m</span>
            )}
            <div className="mt-1 text-xs text-gray-500">
              实测快照：{form.pieceCount || 0} 件 · {calculatedTotalLength || 0} m · {form.totalWeight || 0} kg
            </div>
            {materialUsesDualUnit && (
              <div className="mt-1 text-xs text-gray-500">
                核算数量：{effectiveValuationQty} {valuationUnitLabel}{actualReferenceQty > 0 ? '（本批实测）' : `（默认换算 ${referenceValuationQty}）`}
              </div>
            )}
          </div>
          {isLengthMaterial && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 pt-3">
              <div className="text-xs text-gray-600">
                {linkedBatchRatios
                  ? `已锁定本批比例：${linkedBatchRatios.lengthPerPiece.toFixed(6)} m/件，${linkedBatchRatios.weightPerLength.toFixed(6)} kg/m`
                  : '填完数量、总长度和总重量后，可锁定本批比例进行三值联动。'}
              </div>
              <button
                type="button"
                onClick={toggleBatchLink}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${linkedBatchRatios ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white text-blue-700'}`}
              >
                {linkedBatchRatios ? '关闭比例联动' : '开启比例联动'}
              </button>
            </div>
          )}
        </div>
      )}
      <div className={`space-y-4 ${selectedMaterial ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
        <div className="rounded-lg border border-gray-200 p-4">
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-800">采购计价</div>
          <div className="mt-0.5 text-xs text-gray-500">单价或总价格任选一个修改，系统按所选计价单位自动换算另一项。</div>
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
                className="w-24 border-l border-gray-200 bg-gray-50 px-2 text-sm outline-none"
              >
                <option value="m">元 / 米</option>
                <option value="kg">元 / kg</option>
                <option value="件">元 / 件</option>
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
          <div>计价数量：{priceQuantity || 0} {displayPriceUnit(form.priceUnit)}</div>
          <div>单价：¥{unitPricePreview.toFixed(4)} / {displayPriceUnit(form.priceUnit)}</div>
          <div>总价格：¥{totalAmountPreview.toFixed(2)}</div>
          <div>主库存单位成本：¥{stockUnitCostPreview.toFixed(4)} / {stockUnitLabel}</div>
          {materialUsesDualUnit && (
            <>
              <div>核算单位成本：¥{valuationUnitCostPreview.toFixed(4)} / {valuationUnitLabel}</div>
              <div>本批实际换算：{actualConversionRate || 0} {valuationUnitLabel} / {stockUnitLabel}</div>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:col-span-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">批次号</label>
          <input
            type="text"
            value={form.batchNo}
            onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">收货人</label>
          <input
            type="text"
            value={form.receivedBy}
            onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      <div className="lg:col-span-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
        <textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          rows={2}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      {!editingItem && selectedMaterial && (
        <div className="flex justify-end lg:col-span-12">
          <AppButton variant="secondary" onClick={addCurrentItem}>添加本项并继续</AppButton>
        </div>
      )}
      {!editingItem && (
        <div className="lg:col-span-12">
          <DraftDocumentAttachmentPanel
            ownerType="MATERIAL_IN"
            draftOwnerId={draftAttachmentOwnerId}
            onRecognized={applyRecognizedMaterialIn}
            onBusyChange={setDraftAttachmentBusy}
            onMessage={onMessage}
          />
        </div>
      )}
    </div>
    {!editingItem && (
      <aside className="mt-5 border-t border-gray-200 pt-5 xl:mt-0 xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white pb-3">
          <div className="text-sm font-semibold text-gray-900">本单已加入</div>
          <div className="text-xs tabular-nums text-gray-500">{draftItems.length} 项</div>
        </div>
        {draftItems.length === 0 ? (
          <div className="border-y border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            暂无已加入物料
          </div>
        ) : (
          <div className="border-t border-gray-200">
            {draftItems.map((item, index) => {
              const material = materials.find((option) => option.id === item.materialId)
              const location = locations.find((option) => option.id === item.locationId)
              return (
                <div key={item.id} className="border-b border-gray-100 py-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium text-gray-900">
                        {material ? formatMaterialLabel(material) : item.materialId}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {item.qty} {item.unit} · ¥{item.totalAmount.toFixed(2)}
                      </div>
                      <div className="mt-0.5 break-words text-xs text-gray-500">
                        {location ? `${location.code} · ${location.name}` : item.locationId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftItems((current) => current.filter((draft) => draft.id !== item.id))}
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      移除
                    </button>
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
      </aside>
    )}
  </div>
</ModalDialog>
  )
}
