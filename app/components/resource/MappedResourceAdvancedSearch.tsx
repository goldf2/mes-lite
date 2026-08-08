'use client'

import { useMemo } from 'react'
import type { ResourceAdvancedSearchField, ResourceSearchCondition, ResourceSearchFieldType } from '@/lib/resource-search'
import ResourceAdvancedSearch from './ResourceAdvancedSearch'

export interface MappedAdvancedSearchField {
  key: string
  label: string
  type?: ResourceSearchFieldType
  value: string
  onChange: (value: string) => void
  options?: readonly { value: string; label: string }[]
}

export default function MappedResourceAdvancedSearch({ fields }: { fields: readonly MappedAdvancedSearchField[] }) {
  const advancedFields = useMemo<readonly ResourceAdvancedSearchField<never>[]>(() => fields.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type || (field.options ? 'select' : 'text'),
    options: field.options,
    read: () => '',
  })), [fields])
  const conditions = useMemo<ResourceSearchCondition[]>(() => fields.flatMap((field) => field.value ? [{
    id: `mapped-${field.key}`,
    field: field.key,
    operator: field.options ? 'equals' as const : 'contains' as const,
    value: field.value,
  }] : []), [fields])

  const apply = (next: ResourceSearchCondition[]) => {
    for (const field of fields) {
      field.onChange(next.find((condition) => condition.field === field.key)?.value || '')
    }
  }

  return <ResourceAdvancedSearch fields={advancedFields} conditions={conditions} onChange={apply} />
}
