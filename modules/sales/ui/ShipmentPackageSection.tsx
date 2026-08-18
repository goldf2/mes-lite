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
  const unit = shipment.packages[0]?.items[0]?.unitSnapshot || shipment.product.unit
  const packagingComplete = shipment.packages.length > 0 && Math.abs(packedQty - shipment.qty) <= 0.000001

  const openShipmentQr = () => setQrTarget({
    referenceType: 'SHIPMENT',
    referenceId: shipment.id,
    data: {
      title: `发货单 ${shipment.shipmentNo}`,
      code: shipment.shipmentNo,
      description: `${shipment.customer} · ${shipment.product.name}`,
      details: [`数量：${shipment.qty} ${shipment.product.unit}`, `物流单号：${shipment.trackingNo || '待补充'}`, `货箱：${shipment.packages.length} 个`],
    },
  })

  const openPackageQr = (packageDocument: ShipmentPackage) => setQrTarget({
    referenceType: 'PACKAGE_DOCUMENT',
    referenceId: packageDocument.id,
    data: {
      title: `货箱 ${packageDocument.packageNo}`,
      code: packageDocument.packageNo,
      description: `${shipment.product.name} · 发货单 ${shipment.shipmentNo}`,
      details: [
        `内容：${quantityOf(packageDocument)} ${packageDocument.items[0]?.unitSnapshot || shipment.product.unit}`,
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
            {shipment.packages.length === 0 ? '未启用货箱管理，旧发货流程仍可继续。' : `已装 ${packedQty} / ${shipment.qty} ${unit}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" onClick={openShipmentQr}><QrCode className="h-4 w-4" />发货单码</AppButton>
          {canManage && shipment.status === 'PENDING' && (
            <AppButton size="sm" onClick={() => setCreateOpen(true)} disabled={packedQty >= shipment.qty - 0.000001}><Plus className="h-4 w-4" />新增货箱</AppButton>
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
