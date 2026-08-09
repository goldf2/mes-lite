'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { normalizeUnitCode } from '@/lib/unit-catalog'
import ModalDialog, { ModalActions } from './ModalDialog'
import {
  readBomPagePreferences,
  setBomPagePreferences,
  type BomPagePreferences,
} from './bomPagePreferences'

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
  loadUnitCatalog,
  onMessage,
  children,
}: {
  open: boolean
  onClose: () => void
  pageLabel: string
  showBomUnitOptions: boolean
  loadUnitCatalog?: (signal: AbortSignal) => Promise<ConfiguredUnit[]>
  onMessage: (message: string) => void
  children?: ReactNode
}) {
  const [draftBomPreferences, setDraftBomPreferences] = useState<BomPagePreferences>(readBomPagePreferences)
  const [unitCatalog, setUnitCatalog] = useState<ConfiguredUnit[]>([])
  const [unitLoading, setUnitLoading] = useState(false)
  const lengthUnits = useMemo(() => unitCatalog.filter((unit) => unit.measureType === 'LENGTH'), [unitCatalog])
  const weightUnits = useMemo(() => unitCatalog.filter((unit) => unit.measureType === 'WEIGHT'), [unitCatalog])

  useEffect(() => {
    if (!open) return
    setDraftBomPreferences(readBomPagePreferences())
  }, [open])

  useEffect(() => {
    if (!open || !showBomUnitOptions || unitCatalog.length > 0) return
    const controller = new AbortController()
    setUnitLoading(true)
    if (!loadUnitCatalog) {
      onMessage('当前页面没有配置单位目录读取能力')
      setUnitLoading(false)
      return
    }
    loadUnitCatalog(controller.signal)
      .then(setUnitCatalog)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        onMessage(error instanceof Error ? error.message : '读取单位目录失败')
      })
      .finally(() => setUnitLoading(false))
    return () => controller.abort()
  }, [loadUnitCatalog, onMessage, open, showBomUnitOptions, unitCatalog.length])

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
    onClose()
    onMessage('页面选项已保存')
  }

  return (
    <ModalDialog
      title={`页面选项 · ${pageLabel}`}
      onClose={onClose}
      size="sm"
      bodyClassName="!py-4"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={save}
          disabled={showBomUnitOptions && (unitLoading || lengthUnits.length === 0 || weightUnits.length === 0)}
        />
      )}
    >
      <div className="space-y-4">
        {children}

        {showBomUnitOptions && (
          <section>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="text-sm font-semibold text-gray-900">BOM 新建默认值</div>
              <span className="text-xs text-gray-500">仅影响后续新增</span>
            </div>
            {unitLoading ? (
              <div className="py-4 text-center text-sm text-gray-500" role="status">正在读取单位目录...</div>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  默认长度单位
                  <select
                    value={draftBomPreferences.lengthUnit}
                    onChange={(event) => setDraftBomPreferences((current) => ({ ...current, lengthUnit: event.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
      </div>
    </ModalDialog>
  )
}
