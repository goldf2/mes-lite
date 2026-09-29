'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import ResourceTable from '@/app/components/resource/ResourceTable'
import type { Shipment } from '../contracts/fulfillment'
import { saveShipmentPrices } from '../client/fulfillment-api'

export default function ShipmentPriceEditor({ shipment, onSaved, onMessage }: { shipment: Shipment; onSaved: () => Promise<void>; onMessage: (message: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  if (!['PENDING', 'SHIPPED', 'DELIVERED'].includes(shipment.status)) return null
  if (!editing) return <div className="mt-4"><AppButton onClick={() => { setPrices(Object.fromEntries(shipment.items.map((item) => [item.id, String(item.unitPrice)]))); setReason(''); setEditing(true) }}>补填 / 修改发货价格</AppButton></div>
  return <form className="mt-4 space-y-3 rounded-lg border border-blue-200 p-4" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true)
    try {
      await saveShipmentPrices(shipment.id, { updatedAt: shipment.updatedAt, reason, items: shipment.items.map((item) => ({ id: item.id, unitPrice: Number(prices[item.id]) })) })
      setEditing(false); onMessage('发货价格已保存，库存和发货数量不变'); await onSaved()
    } catch (error) { onMessage(error instanceof Error ? error.message : '保存失败') }
    finally { setBusy(false) }
  }}>
    <p className="text-sm text-gray-500">按原发货单位填写单价，只更新单据价格，不调整库存成本。改价后重新打开客户发货单可获取新版；已下载或打印的旧单据不会自动替换。</p>
    <ResourceTable items={shipment.items} getKey={(item) => item.id} columns={[
      { key: 'material', label: '物料', render: (item) => `${item.material.code} · ${item.material.name}` },
      { key: 'qty', label: '原发货数量', render: (item) => `${item.qty} ${item.unitSnapshot}` },
      { key: 'price', label: '单价', render: (item) => <input aria-label={`${item.material.code} 单价`} className={appInputClassName} type="number" min="0" step="any" required disabled={busy} value={prices[item.id] ?? ''} onChange={(event) => setPrices({ ...prices, [item.id]: event.target.value })} /> },
    ]} />
    <FormField label="补价 / 改价原因"><input className={appInputClassName} required minLength={2} maxLength={200} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
    <div className="flex gap-2"><AppButton type="submit" variant="primary" disabled={busy}>保存价格</AppButton><AppButton disabled={busy} onClick={() => setEditing(false)}>取消</AppButton></div>
  </form>
}
