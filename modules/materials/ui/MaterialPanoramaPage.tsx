'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalizeAttachmentRotation } from '@/lib/attachment-rotation'
import { getMaterialPanorama, saveAttachmentRotation } from '../client/materials-api'
import type {
  PanoramaData,
  PanoramaDisplayDensity,
  PanoramaLayoutConfig,
  PanoramaModuleConfig,
  PanoramaViewerState,
  WorkInstructionSummary,
} from '../contracts/material-panorama'
import {
  collectRelatedRoutes,
  defaultPanoramaLayout,
  defaultPanoramaModules,
  normalizePanoramaLayout,
  normalizePanoramaModules,
  panoramaLayoutStorageKey,
} from '../model/material-panorama-view'
import MaterialPanoramaDashboard from './material-panorama/MaterialPanoramaDashboard'
import MaterialPanoramaLayoutDialog from './material-panorama/MaterialPanoramaLayoutDialog'
import { PanoramaDensityProvider } from './material-panorama/MaterialPanoramaPrimitives'
import MaterialPanoramaViewer from './material-panorama/MaterialPanoramaViewer'

export default function MaterialPanoramaPage({
  materialId,
  onClose,
  onMessage,
}: {
  materialId: string
  onClose: () => void
  onMessage: (msg: string) => void
}) {
  const [data, setData] = useState<PanoramaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<PanoramaViewerState | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layoutConfig, setLayoutConfig] = useState<PanoramaLayoutConfig>(defaultPanoramaLayout)
  const moduleConfig = layoutConfig.modules

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(panoramaLayoutStorageKey)
      if (saved) setLayoutConfig(normalizePanoramaLayout(JSON.parse(saved)))
    } catch {
      setLayoutConfig(defaultPanoramaLayout)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getMaterialPanorama(materialId, controller.signal)
      .then(setData)
      .catch((cause) => {
        if (controller.signal.aborted) return
        const message = cause instanceof Error ? cause.message : '获取物料全景失败'
        setError(message)
        onMessage(message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [materialId, onMessage])

  const updateLayoutConfig = (nextConfig: PanoramaLayoutConfig) => {
    const normalized = normalizePanoramaLayout(nextConfig)
    setLayoutConfig(normalized)
    window.localStorage.setItem(panoramaLayoutStorageKey, JSON.stringify(normalized))
  }
  const updateModuleConfig = (nextConfig: PanoramaModuleConfig[]) => updateLayoutConfig({ ...layoutConfig, modules: normalizePanoramaModules(nextConfig) })
  const updateDensity = (density: PanoramaDisplayDensity) => updateLayoutConfig({ ...layoutConfig, density })
  const toggleModule = (id: PanoramaModuleConfig['id']) => updateModuleConfig(moduleConfig.map((item) => item.id === id ? { ...item, visible: !item.visible } : item))
  const moveModule = (id: PanoramaModuleConfig['id'], direction: -1 | 1) => {
    const index = moduleConfig.findIndex((item) => item.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= moduleConfig.length) return
    const nextConfig = [...moduleConfig]
    const [item] = nextConfig.splice(index, 1)
    nextConfig.splice(nextIndex, 0, item)
    updateModuleConfig(nextConfig)
  }

  const relatedRoutes = useMemo(() => data ? collectRelatedRoutes(data) : [], [data])
  const coverImage = data?.attachments.images.find((item) => item.isCover) || data?.attachments.images[0]
  const visibleModuleCount = moduleConfig.filter((item) => item.visible).length
  const densityText = layoutConfig.density === 'compact' ? '紧凑' : '舒适'
  const contentPaddingClass = layoutConfig.density === 'compact' ? 'p-2 sm:p-3' : 'p-3 sm:p-4'

  const openWorkInstructionViewer = (instruction: WorkInstructionSummary) => {
    if (!instruction.attachments.length) {
      onMessage('这条产品文档还没有上传附件')
      return
    }
    setViewer({ instruction, attachments: instruction.attachments, index: 0 })
    setViewerZoom(1)
  }

  const rotateSelectedAttachment = async (delta: number) => {
    const selected = viewer?.attachments[viewer.index]
    if (!selected || rotationSaving) return
    setRotationSaving(true)
    try {
      const result = await saveAttachmentRotation(selected.id, normalizeAttachmentRotation(Number(selected.rotation || 0) + delta))
      const updated = result.attachment
      setViewer((current) => current ? { ...current, attachments: current.attachments.map((item) => item.id === updated.id ? updated : item) } : current)
      setData((current) => current ? {
        ...current,
        attachments: {
          images: current.attachments.images.map((item) => item.id === updated.id ? updated : item),
          documents: current.attachments.documents.map((item) => item.id === updated.id ? updated : item),
          workInstructions: current.attachments.workInstructions.map((item) => item.id === updated.id ? updated : item),
        },
        workInstructions: current.workInstructions.map((instruction) => ({ ...instruction, attachments: instruction.attachments.map((item) => item.id === updated.id ? updated : item) })),
      } : current)
      onMessage(result.message)
    } catch (cause) {
      onMessage(cause instanceof Error ? cause.message : '保存文件方向失败')
    } finally {
      setRotationSaving(false)
    }
  }

  return (
    <PanoramaDensityProvider value={layoutConfig.density}>
      <div className="fixed inset-0 z-[60] mes-modal-overlay-dark p-2 sm:p-4">
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-lg bg-gray-50 shadow-xl">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-2.5 sm:px-5">
            <div className="min-w-0">
              <div className="text-xs text-gray-500">物料全景视图</div>
              <div className="mt-0.5 truncate text-lg font-semibold text-gray-900">{data?.material ? `${data.material.code} · ${data.material.name}` : '加载中'}</div>
              <div className="mt-1 text-xs text-gray-500">{densityText}仪表台 · {visibleModuleCount}/{defaultPanoramaModules.length} 组详细资料可展开</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setLayoutOpen(true)} className="rounded-md border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">布局</button>
              <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">关闭</button>
            </div>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto ${contentPaddingClass}`}>
            {loading && <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-gray-500 shadow-sm">正在加载物料全景...</div>}
            {!loading && error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{error}</div>}
            {!loading && data && (
              <div className="space-y-3">
                {data.integrityWarnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.integrityWarnings.join('；')}</div>}
                <MaterialPanoramaDashboard data={data} modules={moduleConfig} coverImage={coverImage} relatedRoutes={relatedRoutes} onOpenInstruction={openWorkInstructionViewer} />
              </div>
            )}
          </div>
        </div>
      </div>
      {layoutOpen && <MaterialPanoramaLayoutDialog density={layoutConfig.density} modules={moduleConfig} onDensityChange={updateDensity} onToggle={toggleModule} onMove={moveModule} onReset={() => updateLayoutConfig(defaultPanoramaLayout)} onClose={() => setLayoutOpen(false)} />}
      {viewer && <MaterialPanoramaViewer viewer={viewer} zoom={viewerZoom} rotationSaving={rotationSaving} onViewerChange={setViewer} onZoomChange={setViewerZoom} onRotate={(delta) => void rotateSelectedAttachment(delta)} onClose={() => setViewer(null)} />}
    </PanoramaDensityProvider>
  )
}
