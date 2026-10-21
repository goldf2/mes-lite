'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FormField, { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import SearchableSelect from '@/app/components/SearchableSelect'
import { ResourceFormDialog } from '@/app/components/resource'
import { createWarehousePackage, loadWarehousePackingOptions } from '../client/warehouse-package-api'
import type { WarehousePackage, WarehousePackageForm, WarehousePackingOption } from '../contracts/warehouse-package'
import { warehousePackagingTypes } from '../model/warehouse-package-view'

function localDateTime() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function WarehousePackageCreateDialog({ onClose, onCreated, onMessage }: {
  onClose: () => void
  onCreated: (record: WarehousePackage) => void | Promise<void>
  onMessage: (message: string) => void
}) {
  const [options, setOptions] = useState<WarehousePackingOption[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const requestSequence = useRef(0)
  const [form, setForm] = useState<WarehousePackageForm>(() => ({ clientRequestId: crypto.randomUUID(), inventoryLotId: '', locationId: '', quantity: 0, packagingType: 'CARTON', packedBy: '', packedAt: localDateTime(), note: '' }))
  const selected = options.find((option) => `${option.inventoryLotId}:${option.locationId}` === selectedKey)

  const search = useCallback(async (keyword = '') => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError('')
    try {
      const result = await loadWarehousePackingOptions(keyword)
      if (sequence === requestSequence.current) setOptions((previous) => {
        const preserved = previous.find((option) => `${option.inventoryLotId}:${option.locationId}` === selectedKey)
        return preserved && !result.some((option) => option.inventoryLotId === preserved.inventoryLotId && option.locationId === preserved.locationId) ? [preserved, ...result] : result
      })
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError instanceof Error ? requestError.message : '加载可装箱库存失败')
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [selectedKey])

  useEffect(() => { void search(); return () => { requestSequence.current += 1 } }, [search])

  const save = async () => {
    if (!selected || !form.inventoryLotId || !form.locationId) return onMessage('请选择可装箱的产品批次及库位')
    if (!Number.isFinite(form.quantity) || form.quantity <= 0 || form.quantity > selected.unpackedQty) return onMessage(`装箱数量应大于 0 且不超过未装箱数量 ${selected.unpackedQty}`)
    if (!form.packedBy.trim()) return onMessage('请填写包装人员')
    if (!form.packedAt || Number.isNaN(Date.parse(form.packedAt))) return onMessage('请选择有效的包装日期')
    setSaving(true)
    try {
      const record = await createWarehousePackage({ ...form, packedBy: form.packedBy.trim(), packedAt: new Date(form.packedAt).toISOString() })
      onMessage(`装箱记录创建成功：${record.packageNo}`)
      await onCreated(record)
      onClose()
    } catch (requestError) {
      onMessage(requestError instanceof Error ? requestError.message : '创建装箱记录失败')
    } finally { setSaving(false) }
  }

  return <ResourceFormDialog open editing={false} createTitle="新建装箱记录" editTitle="装箱记录" description="从现有库存按一箱一种产品、一个批次装箱；装箱不新增库存。纸箱、网箱和周转盒均可使用。" onClose={onClose} onConfirm={() => void save()} saving={saving} disabled={!selected || loading} size="lg" confirmLabel="保存装箱记录">
    <div className="space-y-4">
      <FormField label="产品 / 批次 / 库位" required hint={loading ? '正在查询可装箱库存…' : '仅显示有未装箱可用数量且有权限的库存'} error={error}>
        <SearchableSelect value={selectedKey} options={options.map((option) => ({ value: `${option.inventoryLotId}:${option.locationId}`, label: `${option.material.code} · ${option.material.name} · ${option.lotNo} · ${option.location.code}`, keywords: `${option.material.spec || ''} ${option.location.name}` }))} placeholder="搜索产品编码、名称、批次或库位" onSearch={search} disabled={saving} onChange={(key) => { const option = options.find((item) => `${item.inventoryLotId}:${item.locationId}` === key); setSelectedKey(key); if (option) setForm((value) => ({ ...value, inventoryLotId: option.inventoryLotId, locationId: option.locationId, quantity: 0, productionPersonnel: option.productionPersonnel, qualityPersonnel: option.qualityPersonnel })) }} />
      </FormField>
      {selected && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{selected.material.name} · {selected.material.spec || '规格未记录'}<div className="mt-1">未装箱可用：{selected.unpackedQty} {selected.material.stockUnit} · {selected.location.name}</div><div className="mt-1 text-xs">生产人员：{selected.productionPersonnel.join('、') || '未记录'}　质检人员：{selected.qualityPersonnel.join('、') || '未记录'}</div></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={`本箱数量${selected ? `（${selected.material.stockUnit}）` : ''}`} required><input aria-label="本箱数量" type="number" min="0" max={selected?.unpackedQty} step="any" value={form.quantity || ''} onChange={(event) => setForm((value) => ({ ...value, quantity: Number(event.target.value) }))} className={appInputClassName} disabled={saving} /></FormField>
        <FormField label="包装类型"><select value={form.packagingType} onChange={(event) => setForm((value) => ({ ...value, packagingType: event.target.value as WarehousePackageForm['packagingType'] }))} className={appSelectClassName} disabled={saving}>{warehousePackagingTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></FormField>
        <FormField label="包装人员" required><input value={form.packedBy} maxLength={100} onChange={(event) => setForm((value) => ({ ...value, packedBy: event.target.value }))} className={appInputClassName} disabled={saving} /></FormField>
        <FormField label="包装日期" required><input type="datetime-local" value={form.packedAt} onChange={(event) => setForm((value) => ({ ...value, packedAt: event.target.value }))} className={appInputClassName} disabled={saving} /></FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="生产人员" hint="默认带出批次来源，可按实际补录；多人用顿号或逗号分隔。"><input value={form.productionPersonnel?.join('、') ?? ''} onChange={(event) => setForm((value) => ({ ...value, productionPersonnel: event.target.value.split(/[、,，]/).map((name) => name.trim()).filter(Boolean) }))} className={appInputClassName} disabled={saving} /></FormField>
        <FormField label="质检人员" hint="仅记录标签人员信息，不改变批次检验结果或库存质量状态。"><input value={form.qualityPersonnel?.join('、') ?? ''} onChange={(event) => setForm((value) => ({ ...value, qualityPersonnel: event.target.value.split(/[、,，]/).map((name) => name.trim()).filter(Boolean) }))} className={appInputClassName} disabled={saving} /></FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">{(['lengthMm', 'widthMm', 'heightMm'] as const).map((key, index) => <FormField key={key} label={`${['长', '宽', '高'][index]}（mm，可选）`}><input type="number" min="0" step="any" value={form[key] ?? ''} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value ? Number(event.target.value) : undefined }))} className={appInputClassName} disabled={saving} /></FormField>)}</div>
      <FormField label="备注"><textarea rows={2} maxLength={1000} value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} className={appTextareaClassName} disabled={saving} /></FormField>
    </div>
  </ResourceFormDialog>
}
