'use client'

import { type ReactNode, useMemo, useState } from 'react'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import type { MaterialOption, WorkInstruction } from '../contracts/work-instruction'
import type { WorkInstructionBulkUpdateInput } from '../contracts/work-instruction-schema'
import { parseFieldOptions } from '../domain/document-field-rules'
import { documentCategoryLabel } from '../domain/document-category-rules'
import { formatMaterialLabel, instructionStatusOptions } from '../model/work-instruction-view'

type BulkUpdates = WorkInstructionBulkUpdateInput['updates']

export default function WorkInstructionBulkEditDialog({
  selectedItems,
  materials,
  fieldDefinitions,
  loading,
  onClose,
  onSubmit,
}: {
  selectedItems: WorkInstruction[]
  materials: MaterialOption[]
  fieldDefinitions: DocumentFieldDefinitionRecord[]
  loading: boolean
  onClose: () => void
  onSubmit: (updates: BulkUpdates) => void
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [version, setVersion] = useState('v1')
  const [status, setStatus] = useState('ACTIVE')
  const [materialId, setMaterialId] = useState('')
  const [note, setNote] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const categoryIds = useMemo(() => Array.from(new Set(selectedItems.map((item) => item.categoryId))), [selectedItems])
  const sameCategory = categoryIds.length === 1
  const selectedCategory = selectedItems[0]?.category
  const selectedCategoryLabel = selectedCategory ? documentCategoryLabel(selectedCategory) : '-'
  const applyCount = Object.values(enabled).filter(Boolean).length

  const toggle = (key: string, checked: boolean) => setEnabled((current) => ({ ...current, [key]: checked }))
  const submit = () => {
    const updates: BulkUpdates = {}
    if (enabled.version) updates.version = version.trim() || 'v1'
    if (enabled.status) updates.status = status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
    if (enabled.materialId) updates.materialId = materialId || null
    if (enabled.note) updates.note = note.trim() || null
    const extensionValues = Object.fromEntries(fieldDefinitions.filter((definition) => enabled[`field:${definition.id}`]).map((definition) => [definition.id, fieldValues[definition.id] || '']))
    if (Object.keys(extensionValues).length > 0) updates.fieldValues = extensionValues
    onSubmit(updates)
  }

  const extensionInput = (definition: DocumentFieldDefinitionRecord) => {
    const value = fieldValues[definition.id] || ''
    const setValue = (next: string) => setFieldValues((current) => ({ ...current, [definition.id]: next }))
    if (definition.fieldType === 'SELECT') {
      return <select value={value} onChange={(event) => setValue(event.target.value)} className={appSelectClassName}><option value="">清空字段</option>{parseFieldOptions(definition.optionsJson).map((option) => <option key={option} value={option}>{option}</option>)}</select>
    }
    if (definition.fieldType === 'BOOLEAN') {
      return <select value={value} onChange={(event) => setValue(event.target.value)} className={appSelectClassName}><option value="">清空字段</option><option value="true">是</option><option value="false">否</option></select>
    }
    return <input type={definition.fieldType === 'NUMBER' ? 'number' : definition.fieldType === 'DATE' ? 'date' : 'text'} value={value} onChange={(event) => setValue(event.target.value)} className={appInputClassName} placeholder="留空将清空该字段" />
  }

  return (
    <ModalDialog
      title={`批量修改（${selectedItems.length} 篇）`}
      description="只会修改勾选“应用此字段”的共同字段，其他内容保持不变。"
      size="wide"
      onClose={onClose}
      closeDisabled={loading}
      footer={<ModalActions onCancel={onClose} onConfirm={submit} confirmLabel={`应用到 ${selectedItems.length} 篇文档`} disabled={!sameCategory || applyCount === 0} busy={loading} />}
    >
      <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${sameCategory ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        {sameCategory ? `当前选中文档均属于同一类别：${selectedCategoryLabel}` : '批量修改要求选中文档属于同一类别。请返回列表重新选择。'}
      </div>

      <section>
        <h4 className="mb-3 text-sm font-semibold text-gray-900">基础字段</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ApplyField label="版本" enabled={Boolean(enabled.version)} onChange={(value) => toggle('version', value)}><input value={version} onChange={(event) => setVersion(event.target.value)} className={appInputClassName} /></ApplyField>
          <ApplyField label="状态" enabled={Boolean(enabled.status)} onChange={(value) => toggle('status', value)}><select value={status} onChange={(event) => setStatus(event.target.value)} className={appSelectClassName}>{instructionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></ApplyField>
          <ApplyField label="关联产品" enabled={Boolean(enabled.materialId)} onChange={(value) => toggle('materialId', value)}>
            <SearchableSelect value={materialId} onChange={setMaterialId} options={[{ value: '', label: '清空关联产品' }, ...materials.map((material) => ({ value: material.id, label: formatMaterialLabel(material), keywords: `${material.code} ${material.name} ${material.spec || ''}` }))]} placeholder="输入产品编码或名称筛选" />
          </ApplyField>
          <ApplyField label="备注" enabled={Boolean(enabled.note)} onChange={(value) => toggle('note', value)} className="md:col-span-2"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={appTextareaClassName} placeholder="留空将清空备注" /></ApplyField>
        </div>
      </section>

      <section className="mt-6 border-t border-gray-100 pt-5">
        <h4 className="mb-1 text-sm font-semibold text-gray-900">扩展字段</h4>
        <p className="mb-3 text-xs text-gray-500">扩展字段取自当前同一类别的字段设置。</p>
        {fieldDefinitions.length === 0 ? <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">当前类别暂无扩展字段</div> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fieldDefinitions.map((definition) => <ApplyField key={definition.id} label={definition.name} enabled={Boolean(enabled[`field:${definition.id}`])} onChange={(value) => toggle(`field:${definition.id}`, value)}>{extensionInput(definition)}</ApplyField>)}
          </div>
        )}
      </section>
    </ModalDialog>
  )
}

function ApplyField({
  label,
  enabled,
  onChange,
  children,
  className = '',
}: {
  label: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${enabled ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-gray-50/50'} ${className}`}>
      <label className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-gray-800">
        <span>{label}</span><span className="inline-flex items-center gap-1.5 text-xs font-normal text-gray-500"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} />应用此字段</span>
      </label>
      <div className={enabled ? '' : 'pointer-events-none opacity-45'}>{children}</div>
    </div>
  )
}
