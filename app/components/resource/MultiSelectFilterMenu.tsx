'use client'

export interface MultiSelectFilterOption {
  value: string
  label: string
  description?: string
  count?: number
}

export default function MultiSelectFilterMenu({
  label,
  options,
  selectedValues,
  onChange,
}: {
  label: string
  options: MultiSelectFilterOption[]
  selectedValues: string[]
  onChange: (values: string[]) => void
}) {
  const selected = new Set(selectedValues)
  const allSelected = options.length > 0 && options.every((option) => selected.has(option.value))

  const toggle = (value: string) => {
    const next = new Set(selectedValues)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(options.filter((option) => next.has(option.value)).map((option) => option.value))
  }

  return (
    <fieldset>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <legend className="text-xs font-semibold text-gray-500">{label}</legend>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : options.map((option) => option.value))}
          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
        >
          {allSelected ? '清空' : '全选'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:block sm:space-y-1">
        {options.map((option) => (
          <label key={option.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition sm:items-start sm:gap-3 sm:border-transparent sm:px-3 sm:py-2.5 ${selected.has(option.value) ? 'border-blue-200 bg-blue-50/70' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => toggle(option.value)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3 text-sm text-gray-800">
                <span>{option.label}</span>
                {option.count !== undefined && <span className="text-xs tabular-nums text-gray-400">{option.count}</span>}
              </span>
              {option.description && <span className="mt-0.5 hidden text-xs text-gray-500 sm:block">{option.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
