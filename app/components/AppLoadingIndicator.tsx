'use client'

import AiAssistantMark from './AiAssistantMark'
import { useAiAssistantAppearance } from './AiAssistantAppearanceProvider'

export default function AppLoadingIndicator({
  label = '加载中...',
  fullScreen = false,
  compact = false,
  className = '',
}: {
  label?: string
  fullScreen?: boolean
  compact?: boolean
  className?: string
}) {
  const { loadingIndicatorEnabled } = useAiAssistantAppearance()
  const containerClassName = fullScreen
    ? 'fixed inset-0 z-[120] min-h-[100dvh] cursor-wait bg-gray-50'
    : compact
      ? 'relative z-20 min-h-0 cursor-wait py-6'
      : 'relative z-20 min-h-40 cursor-wait py-12'
  const markClassName = fullScreen ? 'h-20 w-20' : compact ? 'h-9 w-9' : 'h-14 w-14'
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center gap-3 text-sm text-gray-500 ${containerClassName} ${className}`}
    >
      {loadingIndicatorEnabled && (
        <AiAssistantMark
          animated
          priority={fullScreen}
          className={markClassName}
        />
      )}
      <span>{label}</span>
    </div>
  )
}
