'use client'

import { ExternalLink, PanelTopClose } from 'lucide-react'
import AppButton from './AppButton'

export default function PageModeToggleButton({
  pageMode,
  onChange,
  disabled = false,
}: {
  pageMode: boolean
  onChange: (pageMode: boolean) => void
  disabled?: boolean
}) {
  const label = pageMode ? '返回弹窗' : '在主页面打开'
  const Icon = pageMode ? PanelTopClose : ExternalLink

  return (
    <AppButton
      variant="ghost"
      size="icon"
      onClick={() => onChange(!pageMode)}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </AppButton>
  )
}
