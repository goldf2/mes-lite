'use client'

import { useEffect, useMemo, useState } from 'react'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import AppButton from '@/app/components/AppButton'
import type { WarehousePackage } from '@/modules/inventory'
import ShipmentWarehousePackagePicker from './ShipmentWarehousePackagePicker'
import {
  DraftDocumentAttachmentPanel,
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/modules/attachments'
import { createShipment, loadShipmentCreateOptions, loadShipmentDetail, saveShipmentDraft } from '../client/fulfillment-api'
import type {
  CustomerMaterialDeliveryReference,
  FulfillmentCustomer,
  InventoryLocationOption,
  Shipment,
  ShipmentCreated,
  ShipmentForm,
  ShipmentFormItem,
  ShipmentMaterialOption,
} from '../contracts/fulfillment'

const newItem = (locations: InventoryLocationOption[] = []): ShipmentFormItem => ({
  clientKey: crypto.randomUUID(),
  materialId: '',
  unitPrice: 0,
  locationId: locations.find((item) => item.isDefault)?.id || locations[0]?.id || '',
  qty: 0,
})

const emptyForm: ShipmentForm = {
  customerId: '',
  voucherNo: '',
  trackingNo: '',
  shippedBy: '',
  note: '',
  items: [],
}

export default function ShipmentCreateDialog({ shipmentId, onClose, onCreated, onSaved, onMessage }: {
  shipmentId?: string
  onClose: () => void
  onCreated?: (shipment: ShipmentCreated) => void | Promise<void>
  onSaved?: () => void | Promise<void>
  onMessage: (message: string) => void
}) {
  const [references, setReferences] = useState<CustomerMaterialDeliveryReference[]>([])
  const [customers, setCustomers] = useState<FulfillmentCustomer[]>([])
  const [materials, setMaterials] = useState<ShipmentMaterialOption[]>([])
  const [locations, setLocations] = useState<InventoryLocationOption[]>([])
  const [unavailableOptions, setUnavailableOptions] = useState<{ customerIds: string[]; materialIds: string[]; locationIds: string[] }>({ customerIds: [], materialIds: [], locationIds: [] })
  const [form, setForm] = useState<ShipmentForm>(emptyForm)
  const [selectedPackages, setSelectedPackages] = useState<WarehousePackage[]>([])
  const [originalShipment, setOriginalShipment] = useState<Shipment | null>(null)
  const [current, setCurrent] = useState<ShipmentFormItem>(() => newItem())
  const [editingClientKey, setEditingClientKey] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [packageBusy, setPackageBusy] = useState(false)
  const [draftAttachmentOwnerId] = useState(createDraftDocumentAttachmentId)
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)

  const selectedMaterial = useMemo(() => materials.find((item) => item.id === current.materialId), [current.materialId, materials])
  const selectedLocationBalance = selectedMaterial?.stock?.locationBalances.find((item) => item.locationId === current.locationId)
  const selectedReference = references.find((item) => item.customerId === form.customerId && item.materialId === current.materialId)
  const packageItemCount = selectedPackages.reduce((count, record) => count + record.items.length, 0)
  const looseAmount = form.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
  const totalAmount = looseAmount + selectedPackages.reduce((sum, record) => sum + record.items.reduce((subtotal, item) => {
    const looseLine = form.items.find((row) => row.materialId === item.materialId && row.locationId === record.placement?.locationId)
    const originalLine = originalShipment?.items.find((row) => row.materialId === item.materialId && row.locationId === record.placement?.locationId)
    const price = looseLine?.unitPrice ?? originalLine?.unitPrice ?? Number(materials.find((material) => material.id === item.materialId)?.defaultSalePrice || 0)
    return subtotal + item.quantity * price
  }, 0), 0)
  const totalItemCount = form.items.length + packageItemCount
  const productSummary = new Map<string, { name: string; unit: string; qty: number }>()
  for (const item of form.items) { const material = materials.find((option) => option.id === item.materialId); const previous = productSummary.get(item.materialId); productSummary.set(item.materialId, { name: `${material?.code || ''} · ${material?.name || '未知产品'}`, unit: material?.stockUnit || material?.unit || '', qty: (previous?.qty || 0) + item.qty }) }
  for (const record of selectedPackages) for (const item of record.items) { const previous = productSummary.get(item.materialId); productSummary.set(item.materialId, { name: `${item.material.code} · ${item.material.name}`, unit: item.unitSnapshot, qty: (previous?.qty || 0) + item.quantity }) }

  useEffect(() => {
    let active = true
    setPreparing(true)
    setLoadError('')
    void Promise.all([loadShipmentCreateOptions(Boolean(shipmentId)), shipmentId ? loadShipmentDetail(shipmentId) : Promise.resolve(null)]).then(([data, shipment]) => {
      if (!active) return
      if (shipment && (shipment.status !== 'PENDING' || !shipment.draft)) throw new Error('该单据已不在待发货状态，请关闭编辑并刷新详情')
      setReferences(data.references)
      const missingCustomer = shipment?.customerId && !data.customers.some((item) => item.id === shipment.customerId)
        ? [{ id: shipment.customerId, code: shipment.customerRef?.code || '', name: `${shipment.customer}（已归档，请更换）` }] : []
      const missingMaterials = shipment ? Array.from(new Map(shipment.items.filter((item) => !data.materials.some((material) => material.id === item.materialId)).map((item) => [item.materialId, { ...item.material, unit: item.material.stockUnit, name: `${item.material.name}（已归档，请移除或替换）` }])).values()) : []
      const missingLocations = shipment ? Array.from(new Map(shipment.items.filter((item) => !data.locations.some((location) => location.id === item.locationId)).map((item) => [item.locationId, { ...item.location, name: `${item.location.name}（不可用，请更换）`, isDefault: false }])).values()) : []
      setCustomers([...data.customers, ...missingCustomer])
      setMaterials([...data.materials, ...missingMaterials])
      setLocations([...data.locations, ...missingLocations])
      setUnavailableOptions({ customerIds: missingCustomer.map((item) => item.id), materialIds: missingMaterials.map((item) => item.id), locationIds: missingLocations.map((item) => item.id) })
      setCurrent(newItem(data.locations))
      setOriginalShipment(shipment)
      if (shipment?.draft) {
        setForm({ customerId: shipment.customerId || '', voucherNo: shipment.voucherNo || '', trackingNo: shipment.trackingNo || '', shippedBy: shipment.shippedBy || '', note: shipment.note || '', items: shipment.draft.items.map((item) => ({ ...item, clientKey: crypto.randomUUID() })) })
        setSelectedPackages(shipment.draft.warehousePackages)
      }
    }).catch((error) => {
      if (active) setLoadError(error instanceof Error ? error.message : '获取发货选项或库位失败')
    }).finally(() => {
      if (active) setPreparing(false)
    })
    return () => { active = false }
  }, [shipmentId, loadAttempt])

  const resetCurrent = () => {
    setCurrent(newItem(locations))
    setEditingClientKey(null)
  }

  const selectCustomer = (customerId: string) => {
    if (customerId === form.customerId) return
    if (current.materialId || editingClientKey) return onMessage('请先保存或清空正在填写的散货，再更换客户')
    const hasOtherCustomerProduct = selectedPackages.some((record) => record.items.some((item) => item.material.customerId && item.material.customerId !== customerId))
      || form.items.some((item) => { const material = materials.find((option) => option.id === item.materialId); return material?.customerId && material.customerId !== customerId })
    if (hasOtherCustomerProduct) return onMessage('已选商品或货箱包含其他客户专用产品，请先移除再更换客户')
    setForm((value) => ({ ...value, customerId }))
    resetCurrent()
  }

  const selectMaterial = (materialId: string) => {
    const material = materials.find((item) => item.id === materialId)
    const bestBalance = material?.stock?.locationBalances
      .filter((balance) => locations.some((location) => location.id === balance.locationId))
      .slice()
      .sort((left, right) => Number(right.availableQty) - Number(left.availableQty))[0]
    setCurrent((value) => ({
      ...value,
      materialId,
      unitPrice: Number(material?.defaultSalePrice || 0),
      locationId: bestBalance?.locationId || value.locationId,
    }))
  }

  const saveCurrent = () => {
    if (!form.customerId) return onMessage('请先选择客户')
    if (!current.materialId) return onMessage('请选择发货物料')
    if (!current.locationId || !Number.isFinite(current.qty) || current.qty <= 0) return onMessage('请选择发货库位并填写大于 0 的数量')
    if (unavailableOptions.materialIds.includes(current.materialId) || unavailableOptions.locationIds.includes(current.locationId)) return onMessage('该商品或库位已不可用，请更换后再加入明细')
    if (!Number.isFinite(current.unitPrice) || current.unitPrice < 0) return onMessage('请填写有效的非负单价')
    if (selectedMaterial?.customerId && selectedMaterial.customerId !== form.customerId) return onMessage('该物料不属于所选客户')
    if (form.items.some((item) => item.clientKey !== editingClientKey && item.materialId === current.materialId && item.locationId === current.locationId)) {
      return onMessage('同一物料和库位不能重复，请编辑已有明细')
    }
    const saved = { ...current, clientKey: editingClientKey || current.clientKey }
    setForm((value) => ({
      ...value,
      items: editingClientKey ? value.items.map((item) => item.clientKey === editingClientKey ? saved : item) : [...value.items, saved],
    }))
    resetCurrent()
  }

  const closeDialog = async () => {
    if (saving || draftAttachmentBusy || packageBusy) return
    await discardDraftDocumentAttachments('SHIPMENT', draftAttachmentOwnerId)
    onClose()
  }

  const applyRecognizedShipment = (fields: Record<string, unknown>) => {
    const customer = customers.find((item) => matchesRecognizedValue(recognizedText(fields, 'customer'), [item.code, item.name]))
    const material = materials.find((item) => matchesRecognizedValue(recognizedText(fields, 'material'), [item.code, item.name, item.spec]))
    setForm((value) => ({
      ...value,
      customerId: customer?.id || value.customerId,
      voucherNo: recognizedText(fields, 'voucherNo') || value.voucherNo,
      trackingNo: recognizedText(fields, 'trackingNo') || value.trackingNo,
      shippedBy: recognizedText(fields, 'shippedBy') || value.shippedBy,
      note: recognizedText(fields, 'note') || value.note,
    }))
    if (material) selectMaterial(material.id)
    setCurrent((value) => ({
      ...value,
      qty: recognizedNumber(fields, 'qty') || value.qty,
      unitPrice: recognizedNumber(fields, 'unitPrice') || value.unitPrice,
    }))
  }

  const handleSubmit = async () => {
    if (preparing || saving || loadError) return
    if (draftAttachmentBusy || packageBusy) return onMessage('请等待货箱识别、附件上传或 AI 识别完成')
    if (!form.customerId || totalItemCount === 0) return onMessage('请选择客户并加入货箱或散货明细')
    if (unavailableOptions.customerIds.includes(form.customerId) || form.items.some((item) => unavailableOptions.materialIds.includes(item.materialId) || unavailableOptions.locationIds.includes(item.locationId))) return onMessage('原单据含已归档客户、商品或不可用库位，请更换或移除后再保存')
    if (current.materialId || editingClientKey) return onMessage('请先将正在填写的散货添加到明细，或取消本项编辑')
    if (form.items.some((item) => { const material = materials.find((option) => option.id === item.materialId); return material?.customerId && material.customerId !== form.customerId })) return onMessage('已加入的散货包含其他客户专用产品，请移除后再保存')
    setSaving(true)
    try {
      const input = { ...form, packageIds: selectedPackages.map((record) => record.id) }
      const shipment = shipmentId && originalShipment ? await saveShipmentDraft(shipmentId, originalShipment.updatedAt, input) : await createShipment(input)
      try {
        await finalizeDraftDocumentAttachments({ ownerType: 'SHIPMENT', draftOwnerId: draftAttachmentOwnerId, targetOwnerId: shipment.id })
      } catch (error) {
        onMessage(error instanceof Error ? `发货单已保存，但${error.message}` : '发货单已保存，但附件绑定失败')
      }
      onMessage(shipmentId ? `发货内容已保存：${shipment.shipmentNo}，尚未扣减库存` : `发货单创建成功：${shipment.shipmentNo}`)
      if (shipmentId) await onSaved?.()
      else await onCreated?.(shipment)
      onClose()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存发货单失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog
      title={shipmentId ? `编辑发货单 ${originalShipment?.shipmentNo || ''}` : '新建发货单'}
      description={shipmentId ? '确认发货前可调整客户、商品、数量、库位和货箱；保存修改不会扣减库存。' : '一张单据对应一个客户，可选择已有货箱、添加散货或混合发货，客户单始终显示具体产品及数量。不关联销售订单，可独立发货。'}
      onClose={() => void closeDialog()}
      closeDisabled={saving || draftAttachmentBusy || packageBusy}
      size="xl"
      footer={<ModalActions onCancel={() => void closeDialog()} onConfirm={handleSubmit} confirmLabel={`${shipmentId ? '保存修改' : '保存整单'}（${selectedPackages.length} 箱 / ${form.items.length} 项散货）`} busy={saving || draftAttachmentBusy || packageBusy} disabled={preparing || Boolean(loadError) || totalItemCount === 0} />}
    >
      {preparing && <p role="status" className="mb-4 text-sm text-gray-500">正在加载发货内容与可选商品…</p>}
      {loadError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}<AppButton className="ml-3" size="sm" onClick={() => setLoadAttempt((value) => value + 1)}>重新加载</AppButton></div>}
      {(unavailableOptions.customerIds.length > 0 || unavailableOptions.materialIds.length > 0 || unavailableOptions.locationIds.length > 0) && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">原单据中存在已归档或当前不可用的资料，已保留名称供核对；保存前请更换客户、商品或库位，或移除相关明细。</p>}
      <fieldset disabled={saving || packageBusy || preparing || Boolean(loadError)} className="min-w-0 space-y-5 disabled:opacity-60">
        <section className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
          <div><label className="mb-2 block text-sm font-medium text-gray-700">客户</label><SearchableSelect value={form.customerId} options={customers.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, keywords: `${item.phone || ''} ${item.address || ''}`, disabled: unavailableOptions.customerIds.includes(item.id) }))} onChange={selectCustomer} placeholder="输入客户编码或名称" /></div>
          <label className="text-sm font-medium text-gray-700">外部凭证号<input value={form.voucherNo} onChange={(event) => setForm((value) => ({ ...value, voucherNo: event.target.value }))} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" /></label>
          <label className="text-sm font-medium text-gray-700">物流单号<input value={form.trackingNo} onChange={(event) => setForm((value) => ({ ...value, trackingNo: event.target.value }))} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" /></label>
          <label className="text-sm font-medium text-gray-700">发货人<input value={form.shippedBy} onChange={(event) => setForm((value) => ({ ...value, shippedBy: event.target.value }))} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" /></label>
        </section>

        <ShipmentWarehousePackagePicker customerId={form.customerId} selected={selectedPackages} retained={originalShipment?.draft?.warehousePackages} onChange={setSelectedPackages} onMessage={onMessage} onBusyChange={setPackageBusy} disabled={saving || preparing || Boolean(loadError)} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <section className="rounded-xl border border-gray-200 p-4">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-gray-900">添加散货明细</h3>{(editingClientKey || current.materialId) && <AppButton variant="ghost" size="sm" onClick={resetCurrent}>{editingClientKey ? '取消编辑' : '清空本项'}</AppButton>}</div>
            <div className="space-y-4">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">发货物料</label><SearchableSelect value={current.materialId} options={materials.filter((item) => !form.customerId || !item.customerId || item.customerId === form.customerId).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, keywords: item.spec || '', disabled: unavailableOptions.materialIds.includes(item.id) }))} onChange={selectMaterial} placeholder="输入物料编码、名称或规格" /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label className="mb-2 block text-sm font-medium text-gray-700">发货库位</label><SearchableSelect value={current.locationId} options={locations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, disabled: unavailableOptions.locationIds.includes(item.id) }))} onChange={(locationId) => setCurrent((value) => ({ ...value, locationId }))} placeholder="选择库位" /></div>
                <label className="text-sm font-medium text-gray-700">数量<input type="number" min="0" step="any" value={current.qty || ''} onChange={(event) => setCurrent((value) => ({ ...value, qty: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
                <label className="text-sm font-medium text-gray-700">单价<input type="number" min="0" step="0.01" value={current.unitPrice || ''} onChange={(event) => setCurrent((value) => ({ ...value, unitPrice: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
              </div>
              {selectedMaterial && <div className={`rounded-lg px-3 py-2 text-xs ${current.qty > Number(selectedLocationBalance?.availableQty || 0) ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>未装箱可用 {selectedLocationBalance?.availableQty || 0} {selectedMaterial.stockUnit}{current.qty > Number(selectedLocationBalance?.availableQty || 0) ? Number(selectedLocationBalance?.packedQty || 0) > 0 ? '；超出散货可用量的部分将登记欠库，已贴标箱内库存保持；整箱发货请选箱' : `；确认发货后预计欠库 ${Number((current.qty - Math.max(0, Number(selectedLocationBalance?.availableQty || 0))).toFixed(6))} ${selectedMaterial.stockUnit}，后续同库位可用入库将自动补齐` : ''}{selectedReference ? `；客户-物料总体参考：订购 ${selectedReference.orderedQty}，待发 ${selectedReference.pendingQty}，已发 ${selectedReference.shippedQty}，未发 ${selectedReference.remainingQty}${selectedReference.overQty > 0 ? `，超发 ${selectedReference.overQty}` : ''} ${selectedReference.unit}` : '；暂无销售需求参考'}</div>}
              <AppButton onClick={saveCurrent} className="w-full" disabled={saving || preparing}>{editingClientKey ? '保存本项修改' : '添加本项并继续'}</AppButton>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">已加入散货</h3><span className="text-sm text-gray-500">{form.items.length} 项</span></div>
            <div className="max-h-[430px] space-y-3 overflow-y-auto">
              {form.items.length === 0 && <div className="rounded-lg bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">尚未加入散货，可仅选择货箱发货</div>}
              {form.items.map((item, index) => { const material = materials.find((option) => option.id === item.materialId); const location = locations.find((option) => option.id === item.locationId); return <div key={item.clientKey} className="rounded-lg border border-gray-200 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-gray-900">{index + 1}. {material?.code} · {material?.name}</div><div className="mt-1 text-xs text-gray-500">{item.qty} {material?.stockUnit} · {location?.code} · ¥{item.unitPrice.toFixed(2)}</div></div><div className="flex gap-2 text-sm"><button type="button" onClick={() => { setCurrent({ ...item }); setEditingClientKey(item.clientKey) }} className="text-blue-600">编辑</button><button type="button" onClick={() => { setForm((value) => ({ ...value, items: value.items.filter((row) => row.clientKey !== item.clientKey) })); if (editingClientKey === item.clientKey) resetCurrent() }} className="text-red-600">移除</button></div></div></div> })}
            </div>
            <div className="mt-4 flex justify-between border-t border-gray-200 pt-4 text-sm"><span className="text-gray-500">散货合计</span><strong className="text-gray-900">¥{looseAmount.toFixed(2)}</strong></div>
          </section>
        </div>

        {productSummary.size > 0 && <section className="rounded-xl border border-gray-200 bg-gray-50 p-4"><h3 className="font-semibold text-gray-900">本次发货产品汇总</h3><div className="mt-3 space-y-2">{Array.from(productSummary.entries()).map(([id, item]) => <div key={id} className="flex justify-between gap-3 text-sm"><span>{item.name}</span><strong className="whitespace-nowrap">{item.qty} {item.unit}</strong></div>)}</div><div className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-500">货箱 {selectedPackages.length} 箱 + 散货 {form.items.length} 项 · 预计金额 ¥{totalAmount.toFixed(2)}（{shipmentId ? '已有产品保留原单价，新增产品采用默认单价' : '货箱按产品默认单价'}，保存后可调整）</div></section>}

        <label className="block text-sm font-medium text-gray-700">备注<textarea rows={3} value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
        <DraftDocumentAttachmentPanel ownerType="SHIPMENT" draftOwnerId={draftAttachmentOwnerId} onRecognized={applyRecognizedShipment} onBusyChange={setDraftAttachmentBusy} onMessage={onMessage} />
      </fieldset>
    </ModalDialog>
  )
}
