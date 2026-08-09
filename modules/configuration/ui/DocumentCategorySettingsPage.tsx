'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DocumentCategoryManagerPanel } from '@/app/components/DocumentCategoryManagerModal'
import { ResourceAdvancedSearch, ResourcePageShell } from '@/app/components/resource'
import { filterByAdvancedSearch, type ResourceAdvancedSearchField, type ResourceSearchCondition } from '@/lib/resource-search'
import { loadDocumentCategories } from '../client/reference-data-api'
import type { DocumentCategoryConfig } from '../contracts/reference-data'

const categoryAdvancedSearchFields: readonly ResourceAdvancedSearchField<DocumentCategoryConfig>[] = [
  { key: 'name', label: '类别名称', type: 'text', read: (item) => item.name },
  { key: 'parent', label: '上级类别', type: 'text', read: (item) => item.parent?.name || '' },
  { key: 'level', label: '类别层级', type: 'select', read: (item) => item.parentId ? 'CHILD' : 'ROOT', options: [{ value: 'ROOT', label: '一级类别' }, { value: 'CHILD', label: '二级类别' }] },
  { key: 'sortOrder', label: '排序值', type: 'number', read: (item) => item.sortOrder },
  { key: 'children', label: '子类别数', type: 'number', read: (item) => item._count.children },
  { key: 'documents', label: '关联文档数', type: 'number', read: (item) => item._count.workInstructions },
]

export default function DocumentCategorySettingsPage({ onMessage, canUpdate, canDelete }: { onMessage: (message: string) => void; canUpdate: boolean; canDelete: boolean }) {
  const [categories, setCategories] = useState<DocumentCategoryConfig[]>([])
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await loadDocumentCategories())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取文档类别失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const visibleCategories = useMemo(() => {
    const advancedCategories = filterByAdvancedSearch(categories, categoryAdvancedSearchFields, conditions)
    const query = keyword.trim().toLocaleLowerCase()
    if (!query) return advancedCategories
    const visibleIds = new Set<string>()
    for (const category of advancedCategories) {
      if (!category.name.toLocaleLowerCase().includes(query)) continue
      visibleIds.add(category.id)
      if (category.parentId) visibleIds.add(category.parentId)
      else advancedCategories.filter((item) => item.parentId === category.id).forEach((item) => visibleIds.add(item.id))
    }
    return advancedCategories.filter((category) => visibleIds.has(category.id))
  }, [categories, conditions, keyword])

  const rootCount = categories.filter((category) => !category.parentId).length
  return (
    <ResourcePageShell
      resourceKey="document-categories"
      title="文档类别"
      description="维护产品文档使用的一级、二级业务分类。"
      summary={`一级 ${rootCount} · 共 ${categories.length} 项`}
      searchValue={keyword}
      onSearchChange={setKeyword}
      searchPlaceholder="搜索文档类别"
      advancedSearch={<ResourceAdvancedSearch fields={categoryAdvancedSearchFields} conditions={conditions} onChange={setConditions} />}
      searchConditions={conditions}
      onSearchConditionsChange={setConditions}
      searchConditionLabel="文档类别精确搜索"
      contentClassName="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      {loading ? <div className="py-12 text-center text-sm text-gray-500">正在读取文档类别…</div> : <DocumentCategoryManagerPanel categories={visibleCategories} onChanged={load} onMessage={onMessage} canUpdate={canUpdate} canDelete={canDelete} />}
    </ResourcePageShell>
  )
}
