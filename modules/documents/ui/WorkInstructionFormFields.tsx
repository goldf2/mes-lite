'use client'

import { useMemo } from 'react'
import SearchableSelect from '@/app/components/SearchableSelect'
import OneToManyRelationField from '@/app/components/relations/OneToManyRelationField'
import OnlineDocumentEditor from './OnlineDocumentEditor'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import type { MaterialOption, WorkCenterOption, WorkInstructionForm } from '../contracts/work-instruction'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import {
  formatMaterialLabel,
  instructionStatusOptions,
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
  const selectOptions = useMemo(() => {
    const available = selectedOption && !options.some((material) => material.id === selectedOption.id)
      ? [selectedOption, ...options]
      : options
    return [
      { value: '', label: emptyLabel, keywords: emptyLabel, material: null },
      ...available.map((material) => ({
        value: material.id,
        label: formatMaterialLabel(material),
        keywords: `${material.code} ${material.name} ${material.spec || ''} ${material.customer?.name || ''}`,
        material,
      })),
    ]
  }, [emptyLabel, options, selectedOption])

  return (
    <SearchableSelect
      value={value}
      options={selectOptions}
      onSearch={onSearch}
      onChange={(nextValue) => onChange(nextValue, nextValue ? options.find((material) => material.id === nextValue) || selectedOption || null : null)}
      placeholder={placeholder}
      emptyText="没有匹配产品"
      allowClear
      searchHint="输入编码、名称、规格或客户继续搜索"
      renderOption={(option) => {
        const material = option.material as MaterialOption | null
        if (!material) return <span className="text-gray-600">{option.label}</span>
        return <><div className="truncate font-medium text-gray-900">{material.code} · {material.name}</div><div className="mt-0.5 truncate text-xs text-gray-500">{[material.spec, material.customer?.name].filter(Boolean).join(' · ') || '无规格/客户信息'}</div></>
      }}
    />
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
  const detailMode = mode === 'detail'
  const batchMode = mode === 'batch'
  const layoutClassName = detailMode
    ? 'grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'
    : 'grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'
  const fullRowClassName = detailMode ? 'md:col-span-2 xl:col-span-4' : 'md:col-span-2 xl:col-span-3'
  const labelClassName = detailMode ? 'mb-1.5 block text-sm font-medium text-gray-700' : 'mb-2 block text-sm font-medium text-gray-700'

  return (
    <div className={layoutClassName}>
      {!batchMode && <div className={detailMode ? 'md:col-span-1 xl:col-span-3' : fullRowClassName}>
        <label className={labelClassName}>文档标题（可选）</label>
        <input value={form.title} onChange={(event) => update('title', event.target.value)} className={appInputClassName} placeholder="留空后自动生成" maxLength={200} />
      </div>}
      {detailMode && <div>
        <label className={labelClassName}>版本</label>
        <input value={form.version} onChange={(event) => update('version', event.target.value)} className={appInputClassName} />
      </div>}
      <div className={detailMode ? 'md:col-span-2 xl:col-span-2' : fullRowClassName}>
        <label className={labelClassName}>关联产品（可选）</label>
        <MaterialSearchSelect value={form.materialId} options={materials} selectedOption={selectedMaterial} onSearch={onMaterialSearch} onChange={(value) => update('materialId', value)} placeholder="输入产品编码、名称或规格搜索" emptyLabel="不绑定产品（通用文档）" />
        {createMode && selectedMaterial?.spec && <div className="mt-1 text-xs text-gray-500">规格：{selectedMaterial.spec}</div>}
      </div>
      <div>
        <label className={labelClassName}>文档类别</label>
        <SearchableSelect value={form.categoryId} onChange={(value) => update('categoryId', value)} options={categoryOptions} placeholder="输入文档类别筛选" />
      </div>
      <div>
        <label className={labelClassName}>状态</label>
        <select value={form.status} onChange={(event) => update('status', event.target.value)} className={appSelectClassName}>{instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </div>
      {createMode && <div>
        <label className={labelClassName}>版本</label>
        <input value={form.version} onChange={(event) => update('version', event.target.value)} className={appInputClassName} placeholder="v1" />
      </div>}
      <div className={fullRowClassName}>
        <label className={labelClassName}>适用工作中心</label>
        <WorkCenterPicker options={workCenters} value={form.workCenterIds} onChange={(value) => update('workCenterIds', value)} />
      </div>
      <DocumentExtensionFields
        definitions={fieldDefinitions}
        values={form.fieldValues}
        onChange={(fieldValues) => update('fieldValues', fieldValues)}
        compact={detailMode}
      />
      <div className={fullRowClassName}>
        <label className={labelClassName}>备注</label>
        <textarea rows={createMode ? 4 : 3} value={form.note} onChange={(event) => update('note', event.target.value)} className={appTextareaClassName} placeholder={createMode ? '记录适用范围、注意事项、变更说明等通用信息' : undefined} />
      </div>
      {mode === 'create' && <div className={fullRowClassName}>
        <label className="mb-2 block text-sm font-medium text-gray-700">在线正文</label>
        <OnlineDocumentEditor value={form.contentJson} onChange={(contentJson) => update('contentJson', contentJson)} />
      </div>}
    </div>
  )
}
