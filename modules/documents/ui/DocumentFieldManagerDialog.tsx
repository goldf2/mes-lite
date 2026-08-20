'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import { listDocumentFieldDefinitions, removeDocumentFieldDefinition, saveDocumentFieldDefinition } from '../client/documents-api'
import type { DocumentFieldDefinitionRecord, DocumentFieldType } from '../contracts/document-field-schema'
import type { DocumentCategoryRecord } from '../contracts/work-instruction'
import { documentCategoryOptions } from '../domain/document-category-rules'
import { documentBaseFields, documentFieldTypeOptions, parseFieldOptions } from '../domain/document-field-rules'

export default function DocumentFieldManagerDialog({
  categories,
  initialCategoryId,
  canCreate,
  canUpdate,
  canDelete,
  onChanged,
  onClose,
  onMessage,
}: {
  categories: DocumentCategoryRecord[]
  initialCategoryId?: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  onChanged: (categoryId: string) => void | Promise<void>
  onClose: () => void
  onMessage: (message: string) => void
}) {
  const [categoryId, setCategoryId] = useState(initialCategoryId || categories[0]?.id || '')
  const [definitions, setDefinitions] = useState<DocumentFieldDefinitionRecord[]>([])
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<DocumentFieldType>('TEXT')
  const [optionsText, setOptionsText] = useState('')
  const [editingDefinition, setEditingDefinition] = useState<DocumentFieldDefinitionRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const categoryOptions = useMemo(() => documentCategoryOptions(categories), [categories])

  const load = useCallback(async () => {
    if (!categoryId) return setDefinitions([])
    setLoading(true)
    try {
      setDefinitions(await listDocumentFieldDefinitions(categoryId))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取扩展字段失败')
    } finally {
      setLoading(false)
    }
  }, [categoryId, onMessage])

  useEffect(() => { void load() }, [load])

  const resetEditor = () => {
    setEditingDefinition(null)
    setName('')
    setFieldType('TEXT')
    setOptionsText('')
  }

  const startEditing = (definition: DocumentFieldDefinitionRecord) => {
    setEditingDefinition(definition)
    setName(definition.name)
    setFieldType(definition.fieldType)
    setOptionsText(parseFieldOptions(definition.optionsJson).join('\n'))
  }

  const saveField = async () => {
    if (!categoryId) return onMessage('请选择文档类别')
    if (!name.trim()) return onMessage('请输入字段名称')
    setSaving(true)
    try {
      await saveDocumentFieldDefinition({
        categoryId,
        name,
        fieldType,
        options: optionsText.split(/[\n,，]/).map((value) => value.trim()).filter(Boolean),
      }, editingDefinition?.id)
      onMessage(editingDefinition ? '扩展字段已更新' : '扩展字段已添加')
      resetEditor()
      await load()
      await onChanged(categoryId)
    } catch (error) {
      const fallbackMessage = editingDefinition ? '更新扩展字段失败' : '新增扩展字段失败'
      onMessage(error instanceof Error ? error.message : fallbackMessage)
    } finally {
      setSaving(false)
    }
  }

  const removeField = async (definition: DocumentFieldDefinitionRecord) => {
    if (definition._count.values > 0) return
    if (!confirm(`确定删除扩展字段“${definition.name}”吗？`)) return
    try {
      onMessage(await removeDocumentFieldDefinition(definition.id))
      if (editingDefinition?.id === definition.id) resetEditor()
      await load()
      await onChanged(categoryId)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '删除扩展字段失败')
    }
  }

  return (
    <ModalDialog
      title="字段设置"
      description="每个文档类别可维护自己的扩展字段；基础字段固定且不可删除，已使用字段只能安全改名。"
      size="wide"
      onClose={onClose}
    >
      <div className="mb-5 max-w-xl">
        <label className="mb-2 block text-sm font-medium text-gray-700">文档类别</label>
        <SearchableSelect value={categoryId} onChange={(value) => { setCategoryId(value); resetEditor() }} options={categoryOptions} placeholder="输入类别名称筛选" />
      </div>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="text-sm font-semibold text-gray-900">基础字段</h4><p className="mt-1 text-xs text-gray-500">所有文档共用，不可删除。</p></div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{documentBaseFields.length} 项</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {documentBaseFields.map((field) => (
            <div key={field} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <span>{field}</span><span className="text-xs text-gray-400">不可删除</span>
            </div>
          ))}
        </div>
      </section>

      {categoryId && ((editingDefinition && canUpdate) || (!editingDefinition && canCreate)) && (
        <section className="mt-5 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{editingDefinition ? '编辑扩展字段' : '添加扩展字段'}</h4>
              {editingDefinition?._count.values ? <p className="mt-1 text-xs text-amber-700">该字段已被 {editingDefinition._count.values} 篇文档使用，只能修改名称，类型和选项已锁定。</p> : null}
            </div>
            {editingDefinition && <AppButton variant="secondary" size="sm" onClick={resetEditor} disabled={saving}>取消编辑</AppButton>}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} className={appInputClassName} placeholder="字段名称，如材料牌号" maxLength={40} />
            <select value={fieldType} onChange={(event) => setFieldType(event.target.value as DocumentFieldType)} className={appSelectClassName} disabled={Boolean(editingDefinition?._count.values)}>
              {documentFieldTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <AppButton variant="primary" onClick={saveField} disabled={saving}>{saving ? '保存中…' : editingDefinition ? '保存修改' : '添加字段'}</AppButton>
          </div>
          {fieldType === 'SELECT' && (
            <textarea value={optionsText} onChange={(event) => setOptionsText(event.target.value)} className={`${appTextareaClassName} mt-3`} rows={3} placeholder="输入下拉选项，每行一项或用逗号分隔" disabled={Boolean(editingDefinition?._count.values)} />
          )}
        </section>
      )}

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h4 className="text-sm font-semibold text-gray-900">扩展字段</h4><p className="mt-1 text-xs text-gray-500">已被文档使用的字段不能删除。</p></div>
          <span className="text-xs text-gray-500">{definitions.length} 项</span>
        </div>
        {loading ? <div className="py-8 text-center text-sm text-gray-500">正在读取…</div> : definitions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">当前类别暂无扩展字段</div>
        ) : (
          <div className="space-y-2">
            {definitions.map((definition) => {
              const used = definition._count.values > 0
              return (
                <div key={definition.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
                  <div>
                    <div className="font-medium text-gray-900">{definition.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {documentFieldTypeOptions.find((option) => option.value === definition.fieldType)?.label || definition.fieldType}
                      {definition.fieldType === 'SELECT' ? ` · ${parseFieldOptions(definition.optionsJson).join('、')}` : ''}
                      {` · ${definition._count.values} 篇文档已填写`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canUpdate && <AppButton variant="secondary" size="sm" onClick={() => startEditing(definition)} disabled={saving}>编辑</AppButton>}
                    {canDelete && <AppButton variant="danger" size="sm" onClick={() => removeField(definition)} disabled={used} title={used ? '字段已被文档使用' : '删除扩展字段'}>删除</AppButton>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </ModalDialog>
  )
}
