'use client'

export type StatusFilterOption = {
  value: string
  label: string
}

export function getStatusQuery(selected: string[], options: StatusFilterOption[]) {
  if (selected.length === options.length) return ''
  const params = new URLSearchParams()
  params.set('statuses', selected.length > 0 ? selected.join(',') : '__NONE__')
  return params.toString()
}

export default function StatusCheckboxFilter({
  options,
  value,
  onChange,
}: {
  options: StatusFilterOption[]
  value: string[]
  onChange: (next: string[]) => void
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <label className="flex h-8 items-center gap-1.5 rounded-md bg-white px-2.5 text-sm text-gray-700 ring-1 ring-gray-200">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        全部状态
      </label>
      {options.map((option) => (
        <label key={option.value} className="flex h-8 items-center gap-1.5 rounded-md bg-white px-2.5 text-sm text-gray-700 ring-1 ring-gray-200">
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
