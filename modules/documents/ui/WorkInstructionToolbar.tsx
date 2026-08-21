'use client'

import { useMemo, type ReactNode } from 'react'
import TopBarPortal from '@/app/components/TopBarPortal'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import ViewModeToggle, { type ViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import AppButton from '@/app/components/AppButton'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import type { WorkInstruction } from '../contracts/work-instruction'
import { buildWorkInstructionSearchCatalog } from '../model/document-search-fields'
import { resourceAdvancedFields } from '@/lib/resource-search'

interface WorkInstructionToolbarProps {
  keyword: string
  onKeywordChange: (value: string) => void
  conditions: ResourceSearchCondition[]
  onConditionsChange: (conditions: ResourceSearchCondition[]) => void
  categoryOptions: { value: string; label: string; keywords?: string }[]
  fieldDefinitions: DocumentFieldDefinitionRecord[]
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  onCreate: () => void
  metadataActions: ReactNode
}

export default function WorkInstructionToolbar({
  keyword,
  onKeywordChange,
  conditions,
  onConditionsChange,
  categoryOptions,
  fieldDefinitions,
  viewMode,
  onViewModeChange,
  onCreate,
  metadataActions,
}: WorkInstructionToolbarProps) {
  const fields = useMemo<readonly ResourceAdvancedSearchField<WorkInstruction>[]>(
    () => resourceAdvancedFields(buildWorkInstructionSearchCatalog(categoryOptions, fieldDefinitions)),
    [categoryOptions, fieldDefinitions],
  )
  const activeLabels = useMemo(() => conditions.map((condition) => {
    const field = fields.find((candidate) => candidate.key === condition.field)
    const option = field?.options?.find((candidate) => candidate.value === condition.value)
    return `${field?.label || condition.field}：${option?.label || condition.value}`
  }), [conditions, fields])

  return (
    <TopBarPortal>
      <ResponsiveToolbarActions
        primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.documents" value={keyword} onChange={onKeywordChange} placeholder="搜索标题、正文、产品或备注" conditions={conditions} onConditionsChange={onConditionsChange} conditionLabel={`${conditions.length} 个文档字段`} />}
        advancedSearch={<ResourceAdvancedSearch fields={fields} conditions={conditions} onChange={onConditionsChange} />}
        filterCount={activeLabels.length}
        filterSummary={activeLabels.slice(0, 3).map((label) => <span key={label} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{label}</span>)}
        viewControl={<ViewModeToggle value={viewMode} onChange={onViewModeChange} />}
        actions={<><AppButton variant="create" onClick={onCreate}>新建文档</AppButton>{metadataActions}</>}
      />
    </TopBarPortal>
  )
}
