'use client'

import { ReactNode } from 'react'
import SearchableSelect, { SearchableSelectOption } from '../SearchableSelect'

export default function RelationSearch<T>({
  items,
  getKey,
  getLabel,
  getKeywords,
  disabledIds = [],
  onSelect,
  renderOption,
  placeholder = '输入关键词筛选',
  emptyText = '没有匹配项目',
}: {
  items: T[]
  getKey: (item: T) => string
  getLabel: (item: T) => string
  getKeywords?: (item: T) => string
  disabledIds?: string[]
  onSelect: (item: T) => void
  renderOption?: (item: T) => ReactNode
  placeholder?: string
  emptyText?: string
}) {
  const disabled = new Set(disabledIds)
  const options: SearchableSelectOption[] = items.map((item) => ({
    value: getKey(item),
    label: getLabel(item),
    keywords: getKeywords?.(item),
    disabled: disabled.has(getKey(item)),
    relationItem: item,
  }))

  return (
    <SearchableSelect
      value=""
      options={options}
      onChange={(value) => {
        const item = items.find((candidate) => getKey(candidate) === value)
        if (item) onSelect(item)
      }}
      placeholder={placeholder}
      emptyText={emptyText}
      renderOption={renderOption ? (option) => renderOption(option.relationItem as T) : undefined}
    />
  )
}
