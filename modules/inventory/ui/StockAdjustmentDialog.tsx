'use client'

import AppButton from '@/app/components/AppButton'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import type { InventoryLocationOption, Stock, StockAdjustmentDraft } from '../contracts/stock'
import { adjustedTotalQuantity, stockDisplayCode, stockDisplayName, stockUnit } from '../model/stock-view'

export function StockAdjustmentDialog({
  stock,
  locations,
  value,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  stock: Stock
  locations: InventoryLocationOption[]
  value: StockAdjustmentDraft
  busy: boolean
  onChange: (value: StockAdjustmentDraft) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <ModalDialog
      title="存货调整"
      description={`${stockDisplayName(stock)} · ${stockDisplayCode(stock)}`}
      onClose={onClose}
      closeDisabled={busy}
      footer={<ModalActions onCancel={onClose} onConfirm={onSubmit} confirmLabel="确认调整" busy={busy} />}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          调整只作用于所选库位，并同步更新物料总库存。用于期初录入、盘点差异、损耗和早期数据尾差修正；来料单整单冲销仍使用“红冲”。
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">调整库位</label>
          <SearchableSelect
            value={value.locationId}
            onChange={(locationId) => {
              const balance = stock.locationBalances.find((item) => item.locationId === locationId)
              onChange({ ...value, locationId, newLocationQty: Number(balance?.qty || 0) })
            }}
            options={locations.map((location) => {
              const balance = stock.locationBalances.find((item) => item.locationId === location.id)
              return {
                value: location.id,
                label: `${location.code} · ${location.name}（当前 ${Number(balance?.qty || 0)} ${stockUnit(stock)}）`,
              }
            })}
            placeholder="输入库位编码或名称筛选"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">调整后库位库存 ({stockUnit(stock)})</label>
            <input
              type="number"
              step="0.0001"
              min={0}
              value={value.newLocationQty || ''}
              onChange={(event) => onChange({ ...value, newLocationQty: Number(event.target.value) })}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">调整后核算库存 {stock.material ? `(${stock.material.valuationUnit})` : ''}</label>
            <input
              type="number"
              step="0.0001"
              min={0}
              value={value.newValuationQty || ''}
              onChange={(event) => onChange({ ...value, newValuationQty: Number(event.target.value) })}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          调整后物料总库存：{adjustedTotalQuantity(stock, value.locationId, value.newLocationQty)} {stockUnit(stock)}
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">调整后库存金额</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={value.newTotalCost || ''}
            onChange={(event) => onChange({ ...value, newTotalCost: Number(event.target.value) })}
            className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">调整原因</label>
          <textarea
            rows={3}
            value={value.reason}
            onChange={(event) => onChange({ ...value, reason: event.target.value })}
            placeholder="例如：期初录入、早期数据成本尾差调整、盘点损耗、称重误差"
            className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </ModalDialog>
  )
}

export function StockAdjustmentHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <ModalDialog title="存货调整说明" onClose={onClose} footer={<AppButton variant="primary" onClick={onClose}>知道了</AppButton>}>
      <div className="space-y-3 text-sm text-gray-600">
        <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
          先建立物料，系统会自动生成 0 库存记录；再回到库存页，在对应库存卡片中点击“存货调整”，填写调整后数量、核算重量、库存金额和原因。
        </div>
        <p>存货调整统一覆盖期初录入、盘点差异、损耗、早期数据尾差和初始化库存。所有调整都会写入操作日志，不做物理删除。</p>
        <p>已经有来料单、领料、红冲等业务单据时，优先使用对应业务单据；存货调整只处理非单据型差异。</p>
      </div>
    </ModalDialog>
  )
}
