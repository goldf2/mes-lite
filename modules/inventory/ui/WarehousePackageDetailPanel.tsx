'use client'

import { useState, type ReactNode } from 'react'
import { Printer, XCircle } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import FormField, { appTextareaClassName } from '@/app/components/FormField'
import { ResourceDetailPanel, ResourceFormDialog } from '@/app/components/resource'
import type { WarehousePackage } from '../contracts/warehouse-package'
import { voidWarehousePackage } from '../client/warehouse-package-api'
import { warehousePackagingTypes, warehousePackageStatusLabel } from '../model/warehouse-package-view'

export default function WarehousePackageDetailPanel({ record, canManage, canPrint, attachments, printing, onPrint, onClose, onChanged, onMessage }: {
  record: WarehousePackage
  canManage: boolean
  canPrint: boolean
  attachments?: ReactNode
  printing: boolean
  onPrint: () => void
  onClose: () => void
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const available = ['PACKED', 'AVAILABLE'].includes(record.status) && !record.shipmentAllocation
  const voidRecord = async () => {
    if (reason.trim().length < 2) return onMessage('作废原因至少填写 2 个字')
    setSaving(true)
    try {
      await voidWarehousePackage(record.id, reason.trim())
      setVoidOpen(false)
      onMessage(`装箱记录 ${record.packageNo} 作废成功，库存回到可选散货范围`)
      await onChanged()
    } catch (error) { onMessage(error instanceof Error ? error.message : '作废装箱记录失败') }
    finally { setSaving(false) }
  }
  return <>
    <ResourceDetailPanel title={record.packageNo} subtitle="装箱记录 · 容器仅记录包装类型" status={<span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{warehousePackageStatusLabel[record.status] || record.status}</span>} onClose={onClose} headerActions={canPrint && !['VOIDED', 'CANCELLED', 'ARCHIVED'].includes(record.status) ? <AppButton size="sm" variant="secondary" disabled={printing} onClick={onPrint}><Printer className="h-4 w-4" />{printing ? '准备标签…' : '打印 / 补打'}</AppButton> : undefined} moreActions={canManage && available ? <AppButton variant="ghost" size="sm" onClick={() => setVoidOpen(true)}><XCircle className="h-4 w-4" />作废装箱记录</AppButton> : undefined}>
      <div className="space-y-5 text-sm">
        <section><h3 className="font-semibold text-gray-900">箱内产品</h3><div className="mt-3 space-y-3">{record.items.map((item) => <div key={item.id} className="rounded-lg border border-gray-200 p-3"><div className="font-medium">{item.material.code} · {item.material.name}</div><div className="mt-1 text-xs text-gray-500">规格：{item.material.spec || '未记录'}</div><div className="mt-2 text-lg font-semibold text-blue-700">{item.quantity} {item.unitSnapshot}</div><div className="mt-1 text-xs text-gray-600">批次：{item.lotNoSnapshot}</div></div>)}</div></section>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3">
          <dt className="text-gray-500">当前位置</dt><dd>{record.placement ? `${record.placement.location.code} · ${record.placement.location.name}` : '未定位'}{record.placement && <div className="mt-1 text-xs text-gray-500">{record.placement.positionXmm == null ? '已知库位，具体位置待确认' : `坐标 ${record.placement.positionXmm}, ${record.placement.positionYmm ?? 0}, ${record.placement.positionZmm ?? 0} mm`}</div>}</dd>
          <dt className="text-gray-500">包装类型</dt><dd>{warehousePackagingTypes.find((type) => type.value === record.packagingType)?.label || record.packagingType}</dd>
          <dt className="text-gray-500">生产人员</dt><dd>{record.productionPersonnel.join('、') || '未记录'}</dd>
          <dt className="text-gray-500">质检人员</dt><dd>{record.qualityPersonnel.join('、') || '未记录'}</dd>
          <dt className="text-gray-500">包装人员</dt><dd>{record.packedBy || '未记录'}</dd>
          <dt className="text-gray-500">包装日期</dt><dd>{new Date(record.packedAt).toLocaleString('zh-CN')}</dd>
          <dt className="text-gray-500">外形尺寸</dt><dd>{[record.lengthMm, record.widthMm, record.heightMm].every((value) => value != null) ? `${record.lengthMm} × ${record.widthMm} × ${record.heightMm} mm` : '未记录'}</dd>
          <dt className="text-gray-500">内容版本</dt><dd>第 {record.contentVersion} 版</dd>
          {record.shipmentAllocation && <><dt className="text-gray-500">关联发货单</dt><dd>{record.shipmentAllocation.shipmentNo}</dd></>}
          {record.note && <><dt className="text-gray-500">备注</dt><dd className="whitespace-pre-wrap break-words">{record.note}</dd></>}
        </dl>
        {attachments}
      </div>
    </ResourceDetailPanel>
    <ResourceFormDialog open={voidOpen} editing={false} createTitle="作废装箱记录" editTitle="作废装箱记录" description="仅解除本次装箱内容的绑定，不增加或减少库存。旧标签将无法再选箱发货。" onClose={() => setVoidOpen(false)} onConfirm={() => void voidRecord()} saving={saving} disabled={reason.trim().length < 2} confirmLabel="确认作废"><FormField label="作废原因" required><textarea value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} className={appTextareaClassName} rows={3} /></FormField></ResourceFormDialog>
  </>
}
