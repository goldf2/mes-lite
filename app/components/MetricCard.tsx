'use client'

import { ReactNode } from 'react'

export type MetricCardTone = 'default' | 'primary' | 'danger' | 'success' | 'warning'

const toneClasses: Record<MetricCardTone, { container: string; value: string }> = {
  default: { container: 'border-gray-200 bg-white', value: 'text-gray-900' },
  primary: { container: 'border-blue-200 bg-blue-50', value: 'text-blue-700' },
  danger: { container: 'border-red-100 bg-red-50', value: 'text-red-700' },
  success: { container: 'border-emerald-100 bg-emerald-50', value: 'text-emerald-700' },
  warning: { container: 'border-amber-100 bg-amber-50', value: 'text-amber-700' },
}

export default function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
  compact = false,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: MetricCardTone
  compact?: boolean
}) {
  const classes = toneClasses[tone]
  const containerClassName = compact ? 'border-gray-100 bg-gray-50' : classes.container

  return (
    <div className={`rounded-lg border ${compact ? 'px-4 py-3' : 'p-4'} ${containerClassName}`}>
      <div className={compact ? 'text-xs text-gray-500' : 'text-sm text-gray-500'}>{label}</div>
      <div className={`mt-1 font-semibold ${compact ? 'text-xl' : 'text-2xl'} ${classes.value}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}
