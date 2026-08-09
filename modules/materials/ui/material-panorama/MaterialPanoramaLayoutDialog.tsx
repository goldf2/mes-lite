'use client'

import ModalOverlay from '@/app/components/ModalOverlay'
import type { PanoramaDisplayDensity, PanoramaModuleConfig, PanoramaModuleId, PanoramaModuleWidth } from '../../contracts/material-panorama'
import { panoramaModuleLabels, panoramaModuleWidthLabels } from '../../model/material-panorama-view'

export default function MaterialPanoramaLayoutDialog({
  density,
  modules,
  onDensityChange,
  onToggle,
  onWidthChange,
  onMove,
  onReset,
  onClose,
}: {
  density: PanoramaDisplayDensity
  modules: PanoramaModuleConfig[]
  onDensityChange: (density: PanoramaDisplayDensity) => void
  onToggle: (id: PanoramaModuleId) => void
  onWidthChange: (id: PanoramaModuleId, width: PanoramaModuleWidth) => void
  onMove: (id: PanoramaModuleId, direction: -1 | 1) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <ModalOverlay onClose={onClose} className="z-[75]">
      <div className="flex max-h-[calc(100vh-32px)] w-[min(calc(100vw-24px),780px)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
          <div><h3 className="text-base font-semibold text-gray-900">全景模块布局</h3><p className="mt-1 text-sm text-gray-500">调整模块显示、宽度和顺序，设置保存在当前浏览器。</p></div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="mb-2 text-sm font-medium text-gray-900">显示密度</div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
              {(['comfortable', 'compact'] as PanoramaDisplayDensity[]).map((value) => (
                <button key={value} type="button" onClick={() => onDensityChange(value)} className={`rounded-md px-3 py-1.5 text-sm ${density === value ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>{value === 'comfortable' ? '舒适' : '紧凑'}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {modules.map((module, index) => {
              const meta = panoramaModuleLabels[module.id]
              return (
                <div key={module.id} className="grid gap-3 rounded-lg border border-gray-200 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_128px_112px]">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input type="checkbox" aria-label={`${meta.name}模块显示`} checked={module.visible} onChange={() => onToggle(module.id)} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <span className="min-w-0"><span className="block text-sm font-medium text-gray-900">{meta.name}</span><span className="mt-0.5 block text-xs text-gray-500">{meta.description}</span></span>
                  </label>
                  <label className="min-w-0 text-xs text-gray-500"><span className="mb-1 block">宽度</span><select aria-label={`${meta.name}模块宽度`} value={module.width} onChange={(event) => onWidthChange(module.id, event.target.value as PanoramaModuleWidth)} className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700">{(Object.keys(panoramaModuleWidthLabels) as PanoramaModuleWidth[]).map((width) => <option key={width} value={width}>{panoramaModuleWidthLabels[width]}</option>)}</select></label>
                  <div className="flex shrink-0 items-end gap-1">
                    <button type="button" disabled={index === 0} onClick={() => onMove(module.id, -1)} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">上移</button>
                    <button type="button" disabled={index === modules.length - 1} onClick={() => onMove(module.id, 1)} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">下移</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex shrink-0 justify-between gap-3 border-t bg-gray-50 px-5 py-4">
          <button type="button" onClick={onReset} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white">恢复默认</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">完成</button>
        </div>
      </div>
    </ModalOverlay>
  )
}
