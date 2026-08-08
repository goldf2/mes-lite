'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DocumentCategoryManagerPanel,
  type DocumentCategoryItem,
} from './DocumentCategoryManagerModal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import TopBarPortal from './TopBarPortal'
import { ResourceAdvancedSearch } from './resource'
import { filterByAdvancedSearch } from '@/lib/resource-search'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'

const categoryAdvancedSearchFields: readonly ResourceAdvancedSearchField<DocumentCategoryItem>[] = [
  { key: 'name', label: '类别名称', type: 'text', read: (item) => item.name },
  { key: 'parent', label: '上级类别', type: 'text', read: (item) => item.parent?.name || '' },
  { key: 'level', label: '类别层级', type: 'select', read: (item) => item.parentId ? 'CHILD' : 'ROOT', options: [{ value: 'ROOT', label: '一级类别' }, { value: 'CHILD', label: '二级类别' }] },
  { key: 'sortOrder', label: '排序值', type: 'number', read: (item) => item.sortOrder },
  { key: 'children', label: '子类别数', type: 'number', read: (item) => item._count.children },
  { key: 'documents', label: '关联文档数', type: 'number', read: (item) => item._count.workInstructions },
]

export default function DocumentCategorySettingsPage({
  onMessage,
  canUpdate,
  canDelete,
}: {
  onMessage: (message: string) => void
  canUpdate: boolean
  canDelete: boolean
}) {
  const [categories, setCategories] = useState<DocumentCategoryItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [loading, setLoading] = useState(true)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/document-categories')
      const data = await response.json()
      if (!response.ok) {
        onMessage(data.error || '获取文档类别失败')
        return
      }
      setCategories(data.data || [])
    } catch (error) {
      onMessage('获取文档类别失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const visibleCategories = useMemo(() => {
    const advancedCategories = filterByAdvancedSearch(categories, categoryAdvancedSearchFields, searchConditions)
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
  }, [categories, keyword, searchConditions])

  const rootCount = categories.filter((category) => !category.parentId).length

  return (
    <div className="min-w-0 space-y-3">
      <TopBarPortal>
        <ResponsiveToolbarActions
          pageKey="documentCategories"
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.documentCategories"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索文档类别"
              conditions={searchConditions}
              onConditionsChange={setSearchConditions}
              conditionLabel="文档类别精确搜索"
            />
          )}
          advancedSearch={<ResourceAdvancedSearch fields={categoryAdvancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />}
        />
      </TopBarPortal>

      <header className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
          <h1 className="shrink-0 text-lg font-semibold text-gray-900">文档类别</h1>
          <p className="min-w-0 text-sm text-gray-500">维护产品文档使用的一级、二级业务分类。</p>
        </div>
        <div className="shrink-0 text-sm text-gray-500">一级 {rootCount} · 共 {categories.length} 项</div>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">正在读取文档类别…</div>
        ) : (
          <DocumentCategoryManagerPanel
            categories={visibleCategories}
            onChanged={loadCategories}
            onMessage={onMessage}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        )}
      </section>
    </div>
  )
}
