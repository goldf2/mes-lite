'use client'

import { useMemo, useState } from 'react'
import { Archive, Box, Plus, QrCode } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import { AttachmentPanel } from '@/modules/attachments'
import { DocumentQrLabelDialog, type DocumentQrLabelData } from '@/modules/operations-tools'
import { archiveShipmentPackage } from '../client/fulfillment-api'
import type { Shipment } from '../contracts/fulfillment'
import type { ShipmentPackage } from '../contracts/shipment-package'
import ShipmentPackageCreateDialog from './ShipmentPackageCreateDialog'

const packageStatusLabels: Record<string, string> = {
  PACKED: '已装箱',
  SHIPPED: '已发货',
  DELIVERED: '已签收',
  CANCELLED: '已取消',
  REVERSED: '已冲销',
  ARCHIVED: '已归档',
}

function quantityOf(packageDocument: ShipmentPackage) {
  return packageDocument.items.reduce((sum, item) => sum + Number(item.quantity), 0)
}

function packageDimensions(packageDocument: ShipmentPackage) {
  const values = [packageDocument.lengthMm, packageDocument.widthMm, packageDocument.heightMm]
  return values.every((value) => value) ? `${values.join(' × ')} mm` : '-'
}

export default function ShipmentPackageSection({
  shipment,
  canManage,
  canManageAttachments,
  onRefresh,
  onMessage,
}: {
  shipment: Shipment
  canManage: boolean
  canManageAttachments: boolean
  onRefresh: () => Promise<void>
  onMessage: (message: string) => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [qrTarget, setQrTarget] = useState<{
    referenceType: 'SHIPMENT' | 'PACKAGE_DOCUMENT'
    referenceId: string
    data: DocumentQrLabelData
  } | null>(null)
  const packedQty = useMemo(() => shipment.packages.reduce((sum, item) => sum + quantityOf(item), 0), [shipment.packages])
  const packedByItem = useMemo(() => new Map(shipment.items.map((item) => [item.id, shipment.packages.reduce((sum, packageDocument) => sum + packageDocument.items.filter((row) => row.shipmentItemId === item.id).reduce((itemSum, row) => itemSum + Number(row.quantity), 0), 0)])), [shipment.items, shipment.packages])
  const packagingComplete = shipment.packages.length > 0 && shipment.items.every((item) => Math.abs((packedByItem.get(item.id) || 0) - item.qty) <= 0.000001)
  const hasUnpackedItem = shipment.items.some((item) => (packedByItem.get(item.id) || 0) < item.qty - 0.000001)
  const firstMaterialName = shipment.items[0]?.material.name || '发货明细'

  const openShipmentQr = () => setQrTarget({
    referenceType: 'SHIPMENT',
    referenceId: shipment.id,
    data: {
      title: `发货单 ${shipment.shipmentNo}`,
      code: shipment.shipmentNo,
      description: `${shipment.customer} · ${firstMaterialName}${shipment.items.length > 1 ? ` 等 ${shipment.items.length} 项` : ''}`,
      details: [`明细：${shipment.items.length} 项`, `物流单号：${shipment.trackingNo || '待补充'}`, `货箱：${shipment.packages.length} 个`],
    },
  })

  const openPackageQr = (packageDocument: ShipmentPackage) => setQrTarget({
    referenceType: 'PACKAGE_DOCUMENT',
    referenceId: packageDocument.id,
    data: {
      title: `货箱 ${packageDocument.packageNo}`,
      code: packageDocument.packageNo,
      description: `${firstMaterialName} · 发货单 ${shipment.shipmentNo}`,
      details: [
        `内容：${packageDocument.items.map((item) => `${item.quantity} ${item.unitSnapshot}`).join('、')}`,
        `打包人：${packageDocument.packedBy}`,
        `打包时间：${new Date(packageDocument.packedAt).toLocaleString('zh-CN')}`,
        `封箱号：${packageDocument.sealNo || '-'}`,
      ],
    },
  })

  const archive = async (packageDocument: ShipmentPackage) => {
    if (!window.confirm(`确定归档货箱 ${packageDocument.packageNo} 吗？`)) return
    try {
      await archiveShipmentPackage(shipment.id, packageDocument.id)
      onMessage(`货箱 ${packageDocument.packageNo} 已归档`)
      await onRefresh()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '归档货箱失败')
    }
  }

  return (
    <section className="mt-5 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Box className="h-4 w-4" />货箱与打包单据</h3>
          <div className="mt-1 text-xs text-gray-500">
            {shipment.packages.length === 0 ? '未启用货箱管理，发货流程仍可继续。' : `已装合计 ${packedQty}；系统按每条发货明细核对。`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" onClick={openShipmentQr}><QrCode className="h-4 w-4" />发货单码</AppButton>
          {canManage && shipment.status === 'PENDING' && (
            <AppButton size="sm" onClick={() => setCreateOpen(true)} disabled={!hasUnpackedItem}><Plus className="h-4 w-4" />新增货箱</AppButton>
          )}
        </div>
      </div>

      {shipment.packages.length > 0 && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${packagingComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {packagingComplete ? '货箱数量与发货单一致，可确认发货。' : '货箱数量尚未与发货单一致，确认发货时将被阻止。'}
        </div>
      )}

      {shipment.packages.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500">尚无货箱单据。</div>
      ) : (
        <div className="mt-3 space-y-3">
          {shipment.packages.map((packageDocument) => (
            <article key={packageDocument.id} className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-blue-700">{packageDocument.packageNo}</span>
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{packageStatusLabels[packageDocument.status] || packageDocument.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{packageDocument.packedBy} · {new Date(packageDocument.packedAt).toLocaleString('zh-CN')}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppButton size="sm" variant="secondary" onClick={() => openPackageQr(packageDocument)}><QrCode className="h-4 w-4" />打印箱码</AppButton>
                  {canManage && shipment.status === 'PENDING' && (
                    <AppButton size="sm" variant="danger" onClick={() => void archive(packageDocument)}><Archive className="h-4 w-4" />归档</AppButton>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded bg-gray-50 p-2"><span className="text-gray-500">内容物</span><div className="mt-1 font-medium">{packageDocument.items.map((item) => `${item.material.name} ${item.quantity} ${item.unitSnapshot}`).join('；')}</div></div>
                <div className="rounded bg-gray-50 p-2"><span className="text-gray-500">毛重 / 净重</span><div className="mt-1 font-medium">{packageDocument.grossWeight || '-'} / {packageDocument.netWeight || '-'} {packageDocument.weightUnit}</div></div>
                <div className="rounded bg-gray-50 p-2"><span className="text-gray-500">尺寸</span><div className="mt-1 font-medium">{packageDimensions(packageDocument)}</div></div>
                <div className="rounded bg-gray-50 p-2"><span className="text-gray-500">封箱号</span><div className="mt-1 font-medium">{packageDocument.sealNo || '-'}</div></div>
              </div>
              {packageDocument.note && <div className="mt-3 text-xs text-gray-600">备注：{packageDocument.note}</div>}
              <div className="mt-4 border-t border-gray-100 pt-3">
                <AttachmentPanel
                  ownerType="PACKAGE_DOCUMENT"
                  ownerId={packageDocument.id}
                  title="货箱实物与打包现场照片"
                  variant="image"
                  documentType="PACKING_PHOTO"
                  layout="gallery"
                  onMessage={onMessage}
                  readOnly={!canManageAttachments}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {createOpen && <ShipmentPackageCreateDialog shipment={shipment} onClose={() => setCreateOpen(false)} onCreated={onRefresh} onMessage={onMessage} />}
      {qrTarget && <DocumentQrLabelDialog {...qrTarget} onClose={() => setQrTarget(null)} onMessage={onMessage} />}
    </section>
  )
}
