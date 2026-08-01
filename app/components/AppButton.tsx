'use client'

import { ButtonHTMLAttributes, ReactNode } from 'react'

export type AppButtonVariant = 'primary' | 'create' | 'secondary' | 'danger' | 'warning' | 'ghost'
export type AppButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<AppButtonVariant, string> = {
  primary: 'border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700',
  create: 'border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700',
  secondary: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  danger: 'border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700',
  warning: 'border-amber-500 bg-amber-500 text-white hover:border-amber-600 hover:bg-amber-600',
  ghost: 'border-transparent bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800',
}

const sizeClasses: Record<AppButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
  icon: 'h-10 w-10 p-0 text-lg',
}

export default function AppButton({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant
  size?: AppButtonSize
  fullWidth?: boolean
  children: ReactNode
}) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
