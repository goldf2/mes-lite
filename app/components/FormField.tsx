'use client'

import { ReactNode } from 'react'

export const appInputClassName = 'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'
export const appTextareaClassName = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'
export const appSelectClassName = appInputClassName

export default function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block min-w-0 text-sm font-medium text-gray-700 ${className}`}>
      <span className="mb-1.5 block">
        {label}
        {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-normal text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs font-normal text-gray-500">{hint}</span>
      ) : null}
    </label>
  )
}
