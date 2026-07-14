'use client'

export type StatusFilterOption = {
  value: string
  label: string
}

export function getStatusQuery(selected: string[], options: StatusFilterOption[]) {
  return getMultiSelectQuery('statuses', selected, options)
}

export function getMultiSelectQuery(paramName: string, selected: string[], options: StatusFilterOption[]) {
  if (selected.length === options.length) return ''
  const params = new URLSearchParams()
  params.set(paramName, selected.length > 0 ? selected.join(',') : '__NONE__')
  return params.toString()
}

export default function StatusCheckboxFilter({
  options,
  value,
  onChange,
  allLabel = '全部状态',
}: {
  options: StatusFilterOption[]
  value: string[]
  onChange: (next: string[]) => void
  allLabel?: string
}) {
  const allSelected = value.length === options.length

  const toggleAll = () => {
    onChange(allSelected ? [] : options.map((option) => option.value))
  }

  const toggleOption = (status: string) => {
    if (value.includes(status)) {
      onChange(value.filter((item) => item !== status))
      return
    }
    onChange([...value, status])
  }

  return (
    <div className="inline-flex max-w-none flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
      <label className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {allLabel}
      </label>
      {options.map((option) => (
        <label key={option.value} className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 text-xs text-gray-700 ring-1 ring-gray-200 sm:h-8 sm:px-2.5 sm:text-sm">
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={() => toggleOption(option.value)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
