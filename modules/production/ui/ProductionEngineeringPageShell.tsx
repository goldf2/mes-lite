import type { ReactNode } from 'react'
import { ResourceAdvancedSearch, ResourcePageShell } from '@/app/components/resource'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'

export default function ProductionEngineeringPageShell<T>({
  resourceKey, title, description, summary, keyword, onKeywordChange, searchPlaceholder, advancedFields,
  conditions, onConditionsChange, conditionLabel, viewMode, onViewModeChange, onCreate, resourceLabel, actions, children,
}: {
  resourceKey: string
  title: string
  description: string
  summary: ReactNode
  keyword: string
  onKeywordChange: (value: string) => void
  searchPlaceholder: string
  advancedFields: readonly ResourceAdvancedSearchField<T>[]
  conditions: readonly ResourceSearchCondition[]
  onConditionsChange: (conditions: ResourceSearchCondition[]) => void
  conditionLabel: string
  viewMode: 'card' | 'list'
  onViewModeChange: (value: 'card' | 'list') => void
  onCreate: () => void
  resourceLabel: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <ResourcePageShell
      resourceKey={resourceKey}
      title={title}
      description={description}
      summary={summary}
      searchValue={keyword}
      onSearchChange={onKeywordChange}
      searchPlaceholder={searchPlaceholder}
      advancedSearch={<ResourceAdvancedSearch fields={advancedFields} conditions={conditions} onChange={onConditionsChange} />}
      searchConditions={conditions}
      onSearchConditionsChange={onConditionsChange}
      searchConditionLabel={conditionLabel}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      displayModes={['card', 'list']}
      onCreate={onCreate}
      resourceLabel={resourceLabel}
      actions={actions}
    >
      {children}
    </ResourcePageShell>
  )
}
