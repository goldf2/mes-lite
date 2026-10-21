'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanLine, X } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import SearchableSelect from '@/app/components/SearchableSelect'
import { loadWarehousePackages, resolveWarehousePackageCode, type WarehousePackage } from '@/modules/inventory'

export default function ShipmentWarehousePackagePicker({ customerId, selected, onChange, onMessage, disabled }: {
  customerId: string
  selected: WarehousePackage[]
  onChange: (records: WarehousePackage[]) => void
  onMessage: (message: string) => void
  disabled: boolean
}) {
  const [options, setOptions] = useState<WarehousePackage[]>([])
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)
  const requestSequence = useRef(0)
  const scanBusy = useRef(false)

  const search = useCallback(async (keyword = '') => {
    if (!customerId) { setOptions([]); return }
    const sequence = ++requestSequence.current
    setLoading(true)
    setError('')
    try {
      const result = await loadWarehousePackages({ availableForShipment: true, customerId, keyword, pageSize: 100 })
      if (sequence === requestSequence.current) setOptions(result.items)
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError instanceof Error ? requestError.message : '加载可发货箱失败')
    } finally { if (sequence === requestSequence.current) setLoading(false) }
  }, [customerId])

  useEffect(() => { void search(); return () => { requestSequence.current += 1 } }, [search])

  const add = (record: WarehousePackage) => {
    if (!customerId) return onMessage('请先选择客户')
    if (selected.some((item) => item.id === record.id)) return onMessage(`货箱 ${record.packageNo} 已加入，本次未重复累计`)
    if (record.items.some((item) => item.material.customerId && item.material.customerId !== customerId)) return onMessage('该货箱中的产品不属于所选客户')
    onChange([...selected, record])
  }

  const scan = async () => {
    if (scanBusy.current || !code.trim()) return
    if (!customerId) return onMessage('请先选择客户')
    scanBusy.current = true
    setResolving(true)
    try {
      const record = await resolveWarehousePackageCode(code)
      add(record)
      setCode('')
    } catch (requestError) { onMessage(requestError instanceof Error ? requestError.message : '无法识别该货箱标签') }
    finally { scanBusy.current = false; setResolving(false) }
  }

  return <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold text-gray-900">选择已有货箱（可选）</h3><span className="text-xs text-gray-500">整箱加入，产品、批次、数量和库位自动带入；可同时添加下方散货。</span></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <FormField label="查找货箱" error={error} hint={loading ? '正在查询可发货箱…' : '仅列出可发货、未被其他发货单占用的货箱'}><SearchableSelect value="" options={options.filter((record) => !selected.some((item) => item.id === record.id)).map((record) => ({ value: record.id, label: `${record.packageNo} · ${record.items.map((item) => `${item.material.code} ${item.material.name} ${item.quantity}${item.unitSnapshot}`).join('；')}`, keywords: record.items.map((item) => `${item.lotNoSnapshot} ${item.material.spec || ''}`).join(' ') }))} onSearch={search} onChange={(id) => { const record = options.find((item) => item.id === id); if (record) add(record) }} placeholder={customerId ? '输入箱号、产品或批次查找' : '请先选择客户'} disabled={disabled || !customerId} /></FormField>
      <FormField label="扫描标签 / 输入箱号" hint="扫描枪输入后按回车；同一货箱重复扫码不会累计数量。"><div className="flex gap-2"><input aria-label="扫描标签或输入箱号" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scan() } }} className={appInputClassName} placeholder="扫描二维码或输入 BX 装箱编号" disabled={disabled || !customerId || resolving} /><AppButton variant="secondary" onClick={() => void scan()} disabled={disabled || !customerId || resolving || !code.trim()}><ScanLine className="h-4 w-4" />{resolving ? '识别中…' : '加入'}</AppButton></div></FormField>
    </div>
    {selected.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-2">{selected.map((record) => <div key={record.id} className="rounded-lg border border-blue-100 bg-white p-3"><div className="flex items-start justify-between gap-2"><span className="font-mono text-sm font-semibold text-blue-700">{record.packageNo}</span><AppButton variant="ghost" size="icon" className="!h-6 !w-6" aria-label={`移除货箱 ${record.packageNo}`} onClick={() => onChange(selected.filter((item) => item.id !== record.id))} disabled={disabled}><X className="h-4 w-4" /></AppButton></div>{record.items.map((item) => <div key={item.id} className="mt-2 text-sm"><div className="font-medium">{item.material.code} · {item.material.name}</div><div className="mt-1 text-xs text-gray-500">{item.material.spec || '规格未记录'} · {item.lotNoSnapshot}</div><div className="mt-1">{item.quantity} {item.unitSnapshot} · {record.placement?.location.code || '未定位'}</div></div>)}</div>)}</div>}
  </section>
}
