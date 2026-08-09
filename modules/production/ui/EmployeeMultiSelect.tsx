'use client'

import SearchableSelect from '@/app/components/SearchableSelect'

export interface EmployeeChoice {
  id: string
  code: string
  name: string
  department?: string | null
}

export default function EmployeeMultiSelect({
  value,
  options,
  onChange,
}: {
  value: string[]
  options: EmployeeChoice[]
  onChange: (value: string[]) => void
}) {
  const selected = value.flatMap((id) => {
    const employee = options.find((item) => item.id === id)
    return employee ? [employee] : []
  })
  const available = options.filter((employee) => !value.includes(employee.id))

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((employee) => (
            <span key={employee.id} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
              <span className="font-mono">{employee.code}</span>
              <span>{employee.name}</span>
              <button
                type="button"
                className="rounded px-1 text-blue-400 hover:bg-blue-100 hover:text-blue-700"
                onClick={() => onChange(value.filter((id) => id !== employee.id))}
                aria-label={`移除${employee.name}`}
              >×</button>
            </span>
          ))}
        </div>
      )}
      <SearchableSelect
        value=""
        onChange={(employeeId) => employeeId && onChange([...value, employeeId])}
        options={available.map((employee) => ({
          value: employee.id,
          label: `${employee.code} · ${employee.name}${employee.department ? ` · ${employee.department}` : ''}`,
          keywords: `${employee.name} ${employee.department || ''}`,
        }))}
        placeholder={available.length > 0 ? '输入工号、姓名或部门添加员工' : '没有更多可选员工'}
        emptyText="没有匹配的在职员工"
        disabled={available.length === 0}
      />
    </div>
  )
}
