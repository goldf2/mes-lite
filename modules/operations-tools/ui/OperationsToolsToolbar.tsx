'use client'

import type { ReactNode } from 'react'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { type ViewMode } from '@/app/components/ViewModeToggle'

export default function OperationsToolsToolbar({
  viewMode,
  onViewModeChange,
  actions,
}: {
  viewMode: ViewMode
  onViewModeChange: (viewMode: ViewMode) => void
  actions?: ReactNode
}) {
  return (
    <TopBarPortal>
      <ResponsiveToolbarActions
        viewControl={<ViewModeToggle value={viewMode} onChange={onViewModeChange} />}
        actions={actions}
      />
    </TopBarPortal>
  )
}
