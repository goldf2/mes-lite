'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchableSelect from '@/app/components/SearchableSelect'
import useDismissibleSearchPopup from '@/app/components/useDismissibleSearchPopup'
import OneToManyRelationField from '@/app/components/relations/OneToManyRelationField'
import OnlineDocumentEditor from './OnlineDocumentEditor'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import type { MaterialOption, WorkCenterOption, WorkInstructionForm } from '../contracts/work-instruction'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import {
  formatMaterialLabel,
  instructionStatusOptions,
  materialIncludesKeyword,
} from '../model/work-instruction-view'
import DocumentExtensionFields from './DocumentExtensionFields'

function MaterialSearchSelect({
  value,
  options,
  selectedOption,
  onChange,
  onSearch,
  placeholder = '输入产品编码或名称搜索',
  emptyLabel = '请选择产品',
}: {
  value: string
  options: MaterialOption[]
  selectedOption?: MaterialOption | null
  onChange: (value: string, material?: MaterialOption | null) => void
  onSearch: (keyword: string) => void | Promise<void>
  placeholder?: string
  emptyLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const closePopup = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, closePopup)
  const selected = selectedOption || options.find((material) => material.id === value) || null
  const visibleOptions = useMemo(() => options.filter((material) => materialIncludesKeyword(material, query)).slice(0, 50), [options, query])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => void onSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [open, query, onSearch])

  const selectMaterial = (material: MaterialOption | null) => {
    onChange(material?.id || '', material)
    closePopup()
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={open ? query : selected ? formatMaterialLabel(selected) : ''}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={(event) => event.key === 'Escape' && closePopup()}
        placeholder={selected ? formatMaterialLabel(selected) : placeholder}
        className="w-full rounded-lg border border-gray-200 px-4 py-2 pr-12 text-sm"
      />
      {value && (
        <button type="button" onClick={() => selectMaterial(null)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">清除</button>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button type="button" onClick={() => selectMaterial(null)} className="block w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50">{emptyLabel}</button>
          {visibleOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">没有匹配产品</div>
          ) : visibleOptions.map((material) => (
            <button key={material.id} type="button" onClick={() => selectMaterial(material)} className="block w-full px-3 py-2 text-left hover:bg-blue-50">
              <div className="truncate text-sm font-medium text-gray-900">{material.code} · {material.name}</div>
              <div className="mt-0.5 truncate text-xs text-gray-500">{[material.spec, material.customer?.name].filter(Boolean).join(' · ') || '无规格/客户信息'}</div>
            </button>
          ))}
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">输入编码、名称、规格或客户继续搜索</div>
        </div>
      )}
    </div>
  )
}

function WorkCenterPicker({ options, value, onChange }: { options: WorkCenterOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const selected = options.filter((item) => value.includes(item.id))
  const available = options.filter((item) => !value.includes(item.id)).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, keywords: item.name }))

  return (
    <OneToManyRelationField
      title="已选工作中心"
      items={selected}
      getKey={(item) => item.id}
      selector={<SearchableSelect value="" onChange={(id) => id && onChange([...value, id])} options={available} placeholder={available.length > 0 ? '输入工作中心筛选并添加' : '已选择全部工作中心'} />}
      renderIdentity={(item) => <><div className="text-sm font-medium text-gray-900">{item.name}</div><div className="font-mono text-xs text-gray-500">{item.code}</div></>}
      onRemove={(item) => onChange(value.filter((id) => id !== item.id))}
      emptyText="未指定时表示不限制工作中心"
    />
  )
}

interface WorkInstructionFormFieldsProps {
  form: WorkInstructionForm
  onChange: (form: WorkInstructionForm) => void
  materials: MaterialOption[]
  selectedMaterial?: MaterialOption | null
  onMaterialSearch: (keyword: string) => void | Promise<void>
  categoryOptions: { value: string; label: string; keywords?: string }[]
  workCenters: WorkCenterOption[]
  fieldDefinitions?: DocumentFieldDefinitionRecord[]
  mode?: 'create' | 'detail' | 'batch'
}

export default function WorkInstructionFormFields({
  form,
  onChange,
  materials,
  selectedMaterial,
  onMaterialSearch,
  categoryOptions,
  workCenters,
  fieldDefinitions = [],
  mode = 'create',
}: WorkInstructionFormFieldsProps) {
  const update = <Key extends keyof WorkInstructionForm>(key: Key, value: WorkInstructionForm[Key]) => onChange({ ...form, [key]: value })
  const createMode = mode !== 'detail'
  const batchMode = mode === 'batch'

  return (
    <div className={createMode ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3' : 'grid grid-cols-1 gap-3'}>
      {!batchMode && <div className={createMode ? 'md:col-span-2 xl:col-span-3' : ''}>
        <label className={createMode ? 'mb-2 block text-sm font-medium text-gray-700' : 'mb-1 block text-xs font-medium text-gray-600'}>文档标题（可选）</label>
        <input value={form.title} onChange={(event) => update('title', event.target.value)} className={appInputClassName} placeholder="留空后自动生成" maxLength={200} />
      </div>}
      <div className={createMode ? 'md:col-span-2 xl:col-span-3' : ''}>
        <label className={createMode ? 'mb-2 block text-sm font-medium text-gray-700' : 'mb-1 block text-xs font-medium text-gray-600'}>关联产品（可选）</label>
        <MaterialSearchSelect value={form.materialId} options={materials} selectedOption={selectedMaterial} onSearch={onMaterialSearch} onChange={(value) => update('materialId', value)} placeholder="输入产品编码、名称或规格搜索" emptyLabel="不绑定产品（通用文档）" />
        {createMode && selectedMaterial?.spec && <div className="mt-1 text-xs text-gray-500">规格：{selectedMaterial.spec}</div>}
      </div>
      <div className={createMode ? '' : 'grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1'}>
        <div>
          <label className={createMode ? 'mb-2 block text-sm font-medium text-gray-700' : 'mb-1 block text-xs font-medium text-gray-600'}>文档类别</label>
          <SearchableSelect value={form.categoryId} onChange={(value) => update('categoryId', value)} options={categoryOptions} placeholder="输入文档类别筛选" />
        </div>
        {!createMode && <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">状态</label>
          <select value={form.status} onChange={(event) => update('status', event.target.value)} className={appSelectClassName}>{instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>}
        {!createMode && <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">版本</label>
          <input value={form.version} onChange={(event) => update('version', event.target.value)} className={appInputClassName} />
        </div>}
      </div>
      {createMode && <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">状态</label>
        <select value={form.status} onChange={(event) => update('status', event.target.value)} className={appSelectClassName}>{instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </div>}
      {createMode && <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">版本</label>
        <input value={form.version} onChange={(event) => update('version', event.target.value)} className={appInputClassName} placeholder="v1" />
      </div>}
      <div className={createMode ? 'md:col-span-2 xl:col-span-3' : ''}>
        <label className={createMode ? 'mb-2 block text-sm font-medium text-gray-700' : 'mb-1 block text-xs font-medium text-gray-600'}>适用工作中心</label>
        <WorkCenterPicker options={workCenters} value={form.workCenterIds} onChange={(value) => update('workCenterIds', value)} />
      </div>
      <DocumentExtensionFields
        definitions={fieldDefinitions}
        values={form.fieldValues}
        onChange={(fieldValues) => update('fieldValues', fieldValues)}
        compact={!createMode}
      />
      <div className={createMode ? 'md:col-span-2 xl:col-span-3' : ''}>
        <label className={createMode ? 'mb-2 block text-sm font-medium text-gray-700' : 'mb-1 block text-xs font-medium text-gray-600'}>备注</label>
        <textarea rows={createMode ? 4 : 3} value={form.note} onChange={(event) => update('note', event.target.value)} className={appTextareaClassName} placeholder={createMode ? '记录适用范围、注意事项、变更说明等通用信息' : undefined} />
      </div>
      {mode === 'create' && <div className="md:col-span-2 xl:col-span-3">
        <label className="mb-2 block text-sm font-medium text-gray-700">在线正文</label>
        <OnlineDocumentEditor value={form.contentJson} onChange={(contentJson) => update('contentJson', contentJson)} />
      </div>}
    </div>
  )
}
