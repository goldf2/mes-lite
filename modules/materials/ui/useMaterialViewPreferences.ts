'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  bomSummaryFieldOptions,
  defaultBomSummaryFields,
  defaultMaterialVisibleFields,
  materialColumnMinWidths,
  materialVisibleFieldOptions,
  type BomSummaryField,
  type MaterialColumnControls,
  type MaterialColumnWidths,
  type MaterialTableColumnKey,
  type MaterialVisibleField,
} from '../model/material-view'

const visibleFieldsStorageKey = 'mes-lite.materials.visibleFields'
const bomSummaryVisibleStorageKey = 'mes-lite.materials.bomSummaryVisible'
const bomSummaryFieldsStorageKey = 'mes-lite.materials.bomSummaryFields'
const columnWidthsStorageKey = 'mes-lite.materials.columnWidths'

export interface MaterialViewPreferencesController {
  visibleFields: MaterialVisibleField[]
  bomSummaryVisible: boolean
  bomSummaryFields: BomSummaryField[]
  columnWidths: MaterialColumnWidths
  columnControls: MaterialColumnControls
  updateVisibleFields: (next: MaterialVisibleField[]) => void
  updateBomSummaryVisible: (visible: boolean) => void
  updateBomSummaryFields: (next: BomSummaryField[]) => void
  resetAllColumnWidths: () => void
}

export default function useMaterialViewPreferences(): MaterialViewPreferencesController {
  const [visibleFields, setVisibleFields] = useState<MaterialVisibleField[]>(defaultMaterialVisibleFields)
  const [bomSummaryVisible, setBomSummaryVisible] = useState(true)
  const [bomSummaryFields, setBomSummaryFields] = useState<BomSummaryField[]>(defaultBomSummaryFields)
  const [columnWidths, setColumnWidths] = useState<MaterialColumnWidths>({})
  const columnResizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem(visibleFieldsStorageKey)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      const allowed = new Set(materialVisibleFieldOptions.map((option) => option.key))
      if (Array.isArray(parsed)) {
        setVisibleFields(parsed.filter((item): item is MaterialVisibleField => allowed.has(item)))
      }
    } catch {
      // Ignore obsolete or manually edited browser preferences.
    }
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem(bomSummaryVisibleStorageKey)
    if (saved !== null) setBomSummaryVisible(saved !== 'false')
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem(bomSummaryFieldsStorageKey)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      const allowed = new Set<BomSummaryField>(bomSummaryFieldOptions.map((option) => option.key))
      if (Array.isArray(parsed)) {
        const next = parsed.filter((item): item is BomSummaryField => allowed.has(item))
        if (next.length > 0) setBomSummaryFields(next)
      }
    } catch {
      // Ignore obsolete or manually edited browser preferences.
    }
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem(columnWidthsStorageKey)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as Record<string, unknown>
      const allowed = new Set(Object.keys(materialColumnMinWidths))
      const next = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
        allowed.has(key) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= materialColumnMinWidths[key as MaterialTableColumnKey] &&
        value <= 720
      ))) as MaterialColumnWidths
      setColumnWidths(next)
    } catch {
      // Ignore obsolete or manually edited browser preferences.
    }
  }, [])

  useEffect(() => () => columnResizeCleanupRef.current?.(), [])

  const updateVisibleFields = useCallback((next: MaterialVisibleField[]) => {
    setVisibleFields(next)
    window.localStorage.setItem(visibleFieldsStorageKey, JSON.stringify(next))
  }, [])

  const updateBomSummaryFields = useCallback((next: BomSummaryField[]) => {
    setBomSummaryFields(next)
    window.localStorage.setItem(bomSummaryFieldsStorageKey, JSON.stringify(next))
  }, [])

  const updateBomSummaryVisible = useCallback((visible: boolean) => {
    setBomSummaryVisible(visible)
    window.localStorage.setItem(bomSummaryVisibleStorageKey, String(visible))
  }, [])

  const updateColumnWidth = useCallback((column: MaterialTableColumnKey, width: number) => {
    setColumnWidths((current) => {
      const next = {
        ...current,
        [column]: Math.min(720, Math.max(materialColumnMinWidths[column], Math.round(width))),
      }
      window.localStorage.setItem(columnWidthsStorageKey, JSON.stringify(next))
      return next
    })
  }, [])

  const resetColumnWidth = useCallback((column: MaterialTableColumnKey) => {
    setColumnWidths((current) => {
      const next = { ...current }
      delete next[column]
      window.localStorage.setItem(columnWidthsStorageKey, JSON.stringify(next))
      return next
    })
  }, [])

  const resetAllColumnWidths = useCallback(() => {
    columnResizeCleanupRef.current?.()
    setColumnWidths({})
    window.localStorage.removeItem(columnWidthsStorageKey)
  }, [])

  const nudgeColumnWidth = useCallback((column: MaterialTableColumnKey, delta: number) => {
    updateColumnWidth(column, (columnWidths[column] || materialColumnMinWidths[column]) + delta)
  }, [columnWidths, updateColumnWidth])

  const startColumnResize = useCallback((
    column: MaterialTableColumnKey,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    columnResizeCleanupRef.current?.()
    const header = event.currentTarget.closest('th')
    if (!header) return
    const startX = event.clientX
    const startWidth = header.getBoundingClientRect().width

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      columnResizeCleanupRef.current = null
    }
    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateColumnWidth(column, startWidth + moveEvent.clientX - startX)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    columnResizeCleanupRef.current = cleanup
  }, [updateColumnWidth])

  const styleFor = useCallback((column: MaterialTableColumnKey): CSSProperties | undefined => {
    const width = columnWidths[column]
    return width ? { width, minWidth: width, maxWidth: width } : undefined
  }, [columnWidths])

  const columnControls = useMemo<MaterialColumnControls>(() => ({
    styleFor,
    onResize: startColumnResize,
    onReset: resetColumnWidth,
    onNudge: nudgeColumnWidth,
  }), [nudgeColumnWidth, resetColumnWidth, startColumnResize, styleFor])

  return {
    visibleFields,
    bomSummaryVisible,
    bomSummaryFields,
    columnWidths,
    columnControls,
    updateVisibleFields,
    updateBomSummaryVisible,
    updateBomSummaryFields,
    resetAllColumnWidths,
  }
}
