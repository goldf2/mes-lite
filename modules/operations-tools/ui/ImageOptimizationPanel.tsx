'use client'

import { useCallback, useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { executeImageOptimizationBatch, loadImageOptimizationPreview } from '../client/maintenance-api'

type ImageOptimizationPreview = {
  scope: 'MATERIAL_IMAGES'
  totalCount: number
  optimizedCount: number
  pendingCount: number
  originalBytes: number
  optimizedBytes: number
  pendingAttachmentIds: string[]
  items: Array<{
    attachmentId: string
    materialCode: string
    materialName: string
    originalName: string
    originalBytes: number
    optimizedBytes: number
    optimized: boolean
  }>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function ImageOptimizationPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [preview, setPreview] = useState<ImageOptimizationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0, failed: 0 })

  const loadPreview = useCallback(async () => {
    setLoading(true)
    try {
      setPreview(await loadImageOptimizationPreview<ImageOptimizationPreview>() || null)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '检查图片优化状态失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const execute = async () => {
    const attachmentIds = preview?.pendingAttachmentIds || []
    if (attachmentIds.length === 0 || executing) return
    if (!confirm(`将为 ${attachmentIds.length} 张物料图片生成缩略图和展示图。原图会完整保留，是否继续？`)) return

    setExecuting(true)
    setProgress({ completed: 0, total: attachmentIds.length, failed: 0 })
    let completed = 0
    let failed = 0
    try {
      for (let index = 0; index < attachmentIds.length; index += 10) {
        const batch = attachmentIds.slice(index, index + 10)
        try {
          const data = await executeImageOptimizationBatch(batch)
          failed += Number(data?.failed || 0)
        } catch (error) {
          failed += batch.length
          onMessage(error instanceof Error ? error.message : '图片优化批次失败')
        }
        completed += batch.length
        setProgress({ completed, total: attachmentIds.length, failed })
      }
      onMessage(failed > 0
        ? `图片优化完成：成功 ${attachmentIds.length - failed} 张，失败 ${failed} 张，原图未受影响`
        : `已优化 ${attachmentIds.length} 张物料图片，原图保留`)
      await loadPreview()
    } finally {
      setExecuting(false)
    }
  }

  const progressPercent = progress.total > 0
    ? Math.round(progress.completed / progress.total * 100)
    : 0
  const visibleItems = preview?.items
    .filter((item) => !item.optimized)
    .slice(0, 8) || []

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="font-medium text-gray-900">图片优化</div>
          <div className="mt-1 text-sm text-gray-500">保留原图，生成适合列表和详情的 WebP 图片，减少页面传输与解码开销。</div>
          <div className="mt-2 text-xs text-gray-500">缩略图在当前浏览器缓存 90 天，展示图缓存 30 天；缓存可由浏览器自动清理，不作为文件备份。</div>
        </div>
        <AppButton
          onClick={execute}
          variant="primary"
          disabled={loading || executing || !preview || preview.pendingCount === 0}
          className="shrink-0"
        >
          {executing ? `优化中 ${progressPercent}%` : '优化待处理图片'}
        </AppButton>
      </div>

      <label className="mt-4 block max-w-xs text-sm text-gray-700">
        <span className="mb-1 block text-xs text-gray-500">优化范围</span>
        <select value="MATERIAL_IMAGES" disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <option value="MATERIAL_IMAGES">物料图片</option>
        </select>
      </label>

      {loading ? (
        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">正在扫描物料图片...</div>
      ) : preview ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">图片总数</div><div className="mt-1 text-xl font-semibold">{preview.totalCount}</div></div>
            <div className="rounded-lg bg-green-50 p-3"><div className="text-xs text-green-600">已优化</div><div className="mt-1 text-xl font-semibold text-green-800">{preview.optimizedCount}</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-600">待处理</div><div className="mt-1 text-xl font-semibold text-amber-800">{preview.pendingCount}</div></div>
            <div className="rounded-lg bg-blue-50 p-3"><div className="text-xs text-blue-600">原图 / 派生图</div><div className="mt-1 text-sm font-semibold text-blue-800">{formatBytes(preview.originalBytes)} / {formatBytes(preview.optimizedBytes)}</div></div>
          </div>

          {executing && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>已处理 {progress.completed} / {progress.total}</span>
                <span>{progress.failed > 0 ? `失败 ${progress.failed}` : `${progressPercent}%`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}

          {preview.pendingCount === 0 ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">当前物料图片均已生成优化版本。</div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2">物料</th><th className="px-3 py-2">原文件</th><th className="px-3 py-2 text-right">大小</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleItems.map((item) => (
                    <tr key={item.attachmentId}>
                      <td className="px-3 py-2"><div className="font-medium text-gray-900">{item.materialName}</div><div className="text-xs text-gray-500">{item.materialCode}</div></td>
                      <td className="max-w-64 truncate px-3 py-2 text-gray-600" title={item.originalName}>{item.originalName}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatBytes(item.originalBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.pendingCount > visibleItems.length && <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">另有 {preview.pendingCount - visibleItems.length} 张待处理图片</div>}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
