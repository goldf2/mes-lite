'use client'

import { useCallback, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import PageOptionsDialog from '@/app/components/PageOptionsDialog'
import ToolbarOrderSettings from '@/app/components/ToolbarOrderSettings'
import type { ViewMode } from '@/app/components/ViewModeToggle'
import useDismissibleSearchPopup from '@/app/components/useDismissibleSearchPopup'
import {
  bomSummaryFieldOptions,
  materialSortOptions,
  materialVisibleFieldOptions,
  type BomSummaryField,
  type MaterialSortBy,
  type MaterialVisibleField,
  type SortDirection,
} from '../model/material-view'
import type { MaterialViewPreferencesController } from './useMaterialViewPreferences'

function MaterialFieldVisibilityControl({
  value,
  onChange,
}: {
  value: MaterialVisibleField[]
  onChange: (next: MaterialVisibleField[]) => void
}) {
  const selected = new Set(value)
  const allSelected = value.length === materialVisibleFieldOptions.length
  const toggleAll = () => onChange(allSelected ? [] : materialVisibleFieldOptions.map((option) => option.key))

  const toggleField = (field: MaterialVisibleField) => {
    onChange(selected.has(field) ? value.filter((item) => item !== field) : [...value, field])
  }

  return (
    <div className="inline-flex max-w-none flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
      <label className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        显示全部
      </label>
      {materialVisibleFieldOptions.map((option) => (
        <label key={option.key} className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
          <input type="checkbox" checked={selected.has(option.key)} onChange={() => toggleField(option.key)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          {option.label}
        </label>
      ))}
    </div>
  )
}

function BomSummaryVisibilityControl({
  visible,
  value,
  onVisibleChange,
  onChange,
}: {
  visible: boolean
  value: BomSummaryField[]
  onVisibleChange: (visible: boolean) => void
  onChange: (next: BomSummaryField[]) => void
}) {
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => setOpen(false), [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = new Set(value)

  const toggleField = (field: BomSummaryField) => {
    if (selected.has(field)) {
      if (value.length > 1) onChange(value.filter((item) => item !== field))
      return
    }
    onChange([...value, field])
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((current) => !current)} className={`h-9 whitespace-nowrap rounded-lg border bg-white px-3 text-sm hover:bg-gray-50 ${visible ? 'border-gray-200 text-gray-700' : 'border-blue-300 text-blue-700'}`}>
        {visible ? 'BOM 简况配置' : 'BOM 简况已隐藏'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50">
            <input type="checkbox" checked={visible} onChange={(event) => onVisibleChange(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            显示 BOM 简况
          </label>
          {visible && (
            <>
              <div className="mx-2 my-1 border-t border-gray-100" />
              {bomSummaryFieldOptions.map((option) => (
                <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(option.key)} onChange={() => toggleField(option.key)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  {option.label}
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function MaterialPageOptions({
  open,
  onClose,
  showBomWorkspace,
  canUseBomData,
  viewMode,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirectionToggle,
  onMessage,
  preferences,
}: {
  open: boolean
  onClose: () => void
  showBomWorkspace: boolean
  canUseBomData: boolean
  viewMode: ViewMode
  sortBy: MaterialSortBy
  sortDir: SortDirection
  onSortByChange: (value: MaterialSortBy) => void
  onSortDirectionToggle: () => void
  onMessage: (message: string) => void
  preferences: MaterialViewPreferencesController
}) {
  return (
    <PageOptionsDialog
      open={open}
      onClose={onClose}
      pageLabel={showBomWorkspace ? 'BOM 设置' : '物料管理'}
      showBomUnitOptions={showBomWorkspace}
      onMessage={onMessage}
    >
      <ToolbarOrderSettings pageKey={showBomWorkspace ? 'bomWorkspace' : 'materialManagement'} />
      {!showBomWorkspace && (
        <>
          <section className="border-t border-gray-100 pt-4">
            <div className="text-sm font-semibold text-gray-900">排序</div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <select value={sortBy} onChange={(event) => onSortByChange(event.target.value as MaterialSortBy)} className="h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm">
                {materialSortOptions.filter((option) => option.value !== 'bomSummary' || canUseBomData).map((option) => <option key={option.value} value={option.value}>按{option.label}</option>)}
              </select>
              <button type="button" onClick={onSortDirectionToggle} className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50">{sortDir === 'asc' ? '升序' : '降序'}</button>
            </div>
          </section>

          <section className="border-t border-gray-100 pt-4">
            <div className="text-sm font-semibold text-gray-900">字段显示</div>
            <div className="mt-2 overflow-x-auto [&>div]:flex-wrap">
              <MaterialFieldVisibilityControl value={preferences.visibleFields} onChange={preferences.updateVisibleFields} />
            </div>
          </section>

          {canUseBomData && (
            <section className="border-t border-gray-100 pt-4">
              <div className="text-sm font-semibold text-gray-900">BOM 简况</div>
              <div className="mt-2">
                <BomSummaryVisibilityControl
                  visible={preferences.bomSummaryVisible}
                  value={preferences.bomSummaryFields}
                  onVisibleChange={preferences.updateBomSummaryVisible}
                  onChange={preferences.updateBomSummaryFields}
                />
              </div>
            </section>
          )}

          {viewMode === 'list' && Object.keys(preferences.columnWidths).length > 0 && (
            <section className="border-t border-gray-100 pt-4">
              <AppButton onClick={preferences.resetAllColumnWidths}>恢复自动列宽</AppButton>
            </section>
          )}
        </>
      )}
    </PageOptionsDialog>
  )
}
