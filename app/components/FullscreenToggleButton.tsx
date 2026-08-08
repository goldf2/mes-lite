'use client'

import { Maximize2, Minimize2 } from 'lucide-react'
import AppButton from './AppButton'

export default function FullscreenToggleButton({
  fullscreen,
  onChange,
  disabled = false,
}: {
  fullscreen: boolean
  onChange: (fullscreen: boolean) => void
  disabled?: boolean
}) {
  const label = fullscreen ? '退出全屏' : '进入全屏'
  const Icon = fullscreen ? Minimize2 : Maximize2

  return (
    <AppButton
      variant="ghost"
      size="icon"
      onClick={() => onChange(!fullscreen)}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </AppButton>
  )
}
