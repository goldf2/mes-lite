'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalizeUnitCode } from '@/lib/unit-catalog'
import ModalDialog, { ModalActions } from './ModalDialog'
import {
  readBomPagePreferences,
  setBomPagePreferences,
  type BomPagePreferences,
} from './bomPagePreferences'
import { useModalGlassPreference } from './interfacePreferences'

interface ConfiguredUnit {
  code: string
  name: string
  measureType: 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'
}

export default function PageOptionsDialog({
  open,
  onClose,
  pageLabel,
  showBomUnitOptions,
  onMessage,
}: {
  open: boolean
  onClose: () => void
  pageLabel: string
  showBomUnitOptions: boolean
  onMessage: (message: string) => void
}) {
  const [modalGlassEnabled, setModalGlassEnabled] = useModalGlassPreference()
  const [draftModalGlassEnabled, setDraftModalGlassEnabled] = useState(modalGlassEnabled)
  const [draftBomPreferences, setDraftBomPreferences] = useState<BomPagePreferences>(readBomPagePreferences)
  const [unitCatalog, setUnitCatalog] = useState<ConfiguredUnit[]>([])
  const [unitLoading, setUnitLoading] = useState(false)
  const lengthUnits = useMemo(() => unitCatalog.filter((unit) => unit.measureType === 'LENGTH'), [unitCatalog])
  const weightUnits = useMemo(() => unitCatalog.filter((unit) => unit.measureType === 'WEIGHT'), [unitCatalog])

  useEffect(() => {
    if (!open) return
    setDraftModalGlassEnabled(modalGlassEnabled)
    setDraftBomPreferences(readBomPagePreferences())
  }, [modalGlassEnabled, open])

  useEffect(() => {
    if (!open || !showBomUnitOptions || unitCatalog.length > 0) return
    const controller = new AbortController()
    setUnitLoading(true)
    fetch('/api/system/units', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取单位目录失败')
        setUnitCatalog(data.data || [])
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        onMessage(error instanceof Error ? error.message : '读取单位目录失败')
      })
      .finally(() => setUnitLoading(false))
    return () => controller.abort()
  }, [onMessage, open, showBomUnitOptions, unitCatalog.length])

  if (!open) return null

  const save = () => {
    if (showBomUnitOptions) {
      const lengthUnit = lengthUnits.find((unit) => normalizeUnitCode(unit.code) === normalizeUnitCode(draftBomPreferences.lengthUnit))
      const weightUnit = weightUnits.find((unit) => normalizeUnitCode(unit.code) === normalizeUnitCode(draftBomPreferences.weightUnit))
      if (!lengthUnit || !weightUnit) {
        onMessage('请选择单位目录中有效的长度和重量单位')
        return
      }
      setBomPagePreferences({ lengthUnit: lengthUnit.code, weightUnit: weightUnit.code })
    }
    setModalGlassEnabled(draftModalGlassEnabled)
    onClose()
    onMessage('页面选项已保存')
  }

  return (
    <ModalDialog
      title="页面选项"
      description={`配置“${pageLabel}”及当前浏览器的页面偏好。`}
      onClose={onClose}
      size="sm"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={save}
          disabled={showBomUnitOptions && (unitLoading || lengthUnits.length === 0 || weightUnits.length === 0)}
        />
      )}
    >
      <div className="space-y-5">
        <section>
          <div className="text-sm font-semibold text-gray-900">界面</div>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 border-t border-gray-100 pt-3">
            <span>
              <span className="block text-sm font-medium text-gray-800">弹窗背景磨砂玻璃</span>
              <span className="mt-1 block text-xs text-gray-500">关闭后仍保留遮罩并屏蔽底层操作。</span>
            </span>
            <input
              type="checkbox"
              checked={draftModalGlassEnabled}
              onChange={(event) => setDraftModalGlassEnabled(event.target.checked)}
              className="sr-only"
            />
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${draftModalGlassEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${draftModalGlassEnabled ? 'left-6' : 'left-1'}`} />
            </span>
          </label>
        </section>

        {showBomUnitOptions && (
          <section className="border-t border-gray-200 pt-5">
            <div className="text-sm font-semibold text-gray-900">BOM 新增明细</div>
            <p className="mt-1 text-xs text-gray-500">只影响之后新建 BOM 和新增的投入、产出行。</p>
            {unitLoading ? (
              <div className="py-6 text-center text-sm text-gray-500" role="status">正在读取单位目录...</div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  默认长度单位
                  <select
                    value={draftBomPreferences.lengthUnit}
                    onChange={(event) => setDraftBomPreferences((current) => ({ ...current, lengthUnit: event.target.value }))}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {lengthUnits.map((unit) => (
                      <option key={`length:${unit.code}`} value={unit.code}>{unit.name}（{unit.code}）</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  默认重量单位
                  <select
                    value={draftBomPreferences.weightUnit}
                    onChange={(event) => setDraftBomPreferences((current) => ({ ...current, weightUnit: event.target.value }))}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {weightUnits.map((unit) => (
                      <option key={`weight:${unit.code}`} value={unit.code}>{unit.name}（{unit.code}）</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </section>
        )}

        <p className="border-t border-gray-100 pt-4 text-xs text-gray-500">这些选项只保存在当前浏览器，不修改业务数据或其他终端。</p>
      </div>
    </ModalDialog>
  )
}
