'use client'

import { useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { AttachmentPanel } from '@/modules/attachments'
import ModalDialog from '@/app/components/ModalDialog'
import type { Material } from '../contracts'
import { findMaterialByCode } from '../client'
import { materialCategoryLabels, primaryMeasureLabels } from '../model/material-options'

export default function MaterialDetailDialog({
  material,
  onClose,
  onEdit,
  onOpenPanorama,
  onMessage,
  onAttachmentsChanged,
}: {
  material: Material | null
  onClose: () => void
  onEdit: (material: Material) => void
  onOpenPanorama: (material: Material) => void
  onMessage: (message: string) => void
  onAttachmentsChanged: () => Promise<void> | void
}) {
  const [detail, setDetail] = useState<Material | null>(material)

  useEffect(() => {
    let cancelled = false
    setDetail(material)
    if (!material) return () => { cancelled = true }

    findMaterialByCode(material.code, material.id)
      .then((latest) => {
        if (!cancelled && latest) setDetail(latest)
      })
      .catch(() => {
        // 列表资料仍可用于详情；重新读取失败不阻塞查看。
      })

    return () => { cancelled = true }
  }, [material])

  if (!material || !detail) return null

  const stockUnit = detail.stockUnit || detail.unit

  return (
    <ModalDialog
      title="物料详情"
      description={`${detail.code} · ${detail.name}`}
      onClose={onClose}
      size="xl"
      headerActions={(
        <>
          <AppButton onClick={() => onOpenPanorama(detail)} variant="create" size="sm">
            全景
          </AppButton>
          <AppButton onClick={() => onEdit(detail)} size="sm">
            编辑资料
          </AppButton>
        </>
      )}
      bodyClassName="space-y-6"
    >
      <div className="grid gap-6 md:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)]">
        <a
          href={detail.primaryImage?.originalUrl || detail.primaryImage?.url}
          target={detail.primaryImage ? '_blank' : undefined}
          rel={detail.primaryImage ? 'noreferrer' : undefined}
          className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-gray-100"
        >
          {detail.primaryImage ? (
            <img
              src={detail.primaryImage.displayUrl || detail.primaryImage.url}
              alt={detail.primaryImage.note || detail.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-sm text-gray-400">暂无物料图片</span>
          )}
        </a>

        <div className="min-w-0">
          <div className="border-b border-gray-200 pb-5">
            <div className="font-mono text-sm text-blue-700">{detail.code}</div>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">{detail.name}</h2>
            <p className="mt-2 text-sm text-gray-600">规格：{detail.spec || '-'}</p>
            {detail.note && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">备注：{detail.note}</p>}
            <p className="mt-1 text-sm text-gray-600">分类：{materialCategoryLabels[detail.category || 'RAW'] || '其他'}</p>
            <p className="mt-1 text-sm text-gray-600">归属客户：{detail.customer?.name || '通用/未绑定'}</p>
          </div>

          <dl className="grid grid-cols-3 border-b border-gray-200 py-5">
            <div>
              <dt className="text-xs text-gray-500">当前库存</dt>
              <dd className="mt-2 text-xl font-semibold text-gray-900">{detail.stock?.qty || 0} {stockUnit}</dd>
            </div>
            <div className="border-l border-gray-200 pl-5">
              <dt className="text-xs text-gray-500">已占用</dt>
              <dd className="mt-2 text-xl font-semibold text-gray-900">{detail.stock?.reservedQty || 0} {stockUnit}</dd>
            </div>
            <div className="border-l border-gray-200 pl-5">
              <dt className="text-xs text-gray-500">可用库存</dt>
              <dd className="mt-2 text-xl font-semibold text-green-700">{detail.stock?.availableQty || 0} {stockUnit}</dd>
            </div>
          </dl>

          <dl className="grid grid-cols-2 gap-5 pt-5">
            <div>
              <dt className="text-xs text-gray-500">主计量方式</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">{primaryMeasureLabels[detail.primaryMeasure] || '其他'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">参考/计价单位</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {detail.referenceMeasure ? `${primaryMeasureLabels[detail.referenceMeasure]} · ` : ''}{detail.valuationUnit}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">参考数量</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">{detail.stock?.valuationQty || 0} {detail.valuationUnit}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">默认参考换算</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">1 {stockUnit} = {detail.conversionRate || 1} {detail.valuationUnit}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">成本方法</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">{detail.costingMethod === 'FIFO' ? '先入先出 FIFO' : '移动加权平均'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">当前平均成本</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                ¥{(detail.stock?.valuationUnitCost || 0).toFixed(4)} / {detail.valuationUnit}
                <span className="ml-2 text-gray-500">¥{(detail.stock?.stockUnitCost || 0).toFixed(4)} / {stockUnit}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">默认销售价</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {detail.defaultSalePrice == null ? '未设置' : `¥${Number(detail.defaultSalePrice).toFixed(2)} · ${detail.salesCurrency || 'CNY'}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">创建时间</dt>
              <dd className="mt-1 text-sm text-gray-900">{new Date(detail.createdAt).toLocaleString('zh-CN')}</dd>
            </div>
          </dl>
        </div>
      </div>

      <AttachmentPanel
        ownerType="MATERIAL"
        ownerId={detail.id}
        title="图片资料"
        variant="image"
        documentType="MATERIAL_IMAGE"
        layout="gallery"
        allowCover
        onMessage={(message) => {
          onMessage(message)
          onAttachmentsChanged()
        }}
      />
    </ModalDialog>
  )
}
