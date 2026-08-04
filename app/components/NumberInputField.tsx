'use client'

import { ReactNode } from 'react'
import FormField, { appInputClassName } from './FormField'

export default function NumberInputField({
  label,
  value,
  unit,
  onChange,
  min = 0,
  step = 'any',
  className = '',
}: {
  label: ReactNode
  value: number
  unit?: ReactNode
  onChange: (value: number) => void
  min?: number
  step?: number | 'any'
  className?: string
}) {
  return (
    <FormField label={label} className={className}>
      <div className="flex overflow-hidden rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
        <input
          type="number"
          min={min}
          step={step}
          value={value || ''}
          onChange={(event) => onChange(Math.max(min, Number(event.target.value)))}
          className={`${appInputClassName} min-w-0 flex-1 focus:ring-0 ${unit ? 'rounded-r-none' : ''}`}
        />
        {unit && (
          <span className="flex shrink-0 items-center rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm font-normal text-gray-500">
            {unit}
          </span>
        )}
      </div>
    </FormField>
  )
}
