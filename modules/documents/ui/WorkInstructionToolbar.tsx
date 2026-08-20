'use client'

import { useMemo, type ReactNode } from 'react'
import TopBarPortal from '@/app/components/TopBarPortal'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import ViewModeToggle, { type ViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import AppButton from '@/app/components/AppButton'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'
import type { WorkInstruction } from '../contracts/work-instruction'
import { fileTypeOptions, instructionStatusOptions } from '../model/work-instruction-view'

interface WorkInstructionToolbarProps {
  keyword: string
  onKeywordChange: (value: string) => void
  conditions: ResourceSearchCondition[]
  onConditionsChange: (conditions: ResourceSearchCondition[]) => void
  categoryOptions: { value: string; label: string; keywords?: string }[]
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
  viewMode,
  onViewModeChange,
  onCreate,
  metadataActions,
}: WorkInstructionToolbarProps) {
  const fields = useMemo<readonly ResourceAdvancedSearchField<WorkInstruction>[]>(() => [
    { key: 'title', label: '文档标题', type: 'text', read: (instruction) => instruction.title },
    { key: 'categoryId', label: '文档类别', type: 'select', read: (instruction) => instruction.categoryId, options: categoryOptions },
    { key: 'status', label: '状态', type: 'select', read: (instruction) => instruction.status, options: instructionStatusOptions },
    { key: 'version', label: '版本', type: 'text', read: (instruction) => instruction.version },
    { key: 'materialCode', label: '产品编码', type: 'text', read: (instruction) => instruction.material?.code },
    { key: 'materialName', label: '产品名称', type: 'text', read: (instruction) => instruction.material?.name },
    { key: 'materialSpec', label: '产品规格', type: 'text', read: (instruction) => instruction.material?.spec },
    { key: 'customerCode', label: '客户编码', type: 'text', read: (instruction) => instruction.material?.customer?.code },
    { key: 'customerName', label: '客户名称', type: 'text', read: (instruction) => instruction.material?.customer?.name },
    { key: 'workCenter', label: '工作中心', type: 'text', read: (instruction) => instruction.workCenters.map((item) => `${item.code} ${item.name}`).join(' ') },
    { key: 'contentText', label: '在线正文', type: 'text', read: (instruction) => instruction.contentText },
    { key: 'note', label: '备注', type: 'text', read: (instruction) => instruction.note },
    { key: 'attachmentName', label: '附件名称', type: 'text', read: (instruction) => instruction.primaryAttachment?.originalName },
    { key: 'fileType', label: '文件类型', type: 'select', read: () => '', options: fileTypeOptions.filter((option) => option.value !== 'all') },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (instruction) => instruction.createdAt },
    { key: 'updatedAt', label: '更新日期', type: 'date', read: (instruction) => instruction.updatedAt },
  ], [categoryOptions])
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
