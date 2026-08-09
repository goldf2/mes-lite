import type { DragEvent, ReactNode } from 'react'

export interface NavigationItem {
  id: string
  label: string
  active: boolean
  icon?: ReactNode
  shortcutKey?: string
  draggable?: boolean
  dragState?: 'idle' | 'dragging' | 'target'
  onClick: () => void
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void
  onDragLeave?: () => void
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void
}

export interface NavigationGroup {
  id: string
  label: string
  icon: ReactNode
  active: boolean
  items: NavigationItem[]
  onClick: () => void
}
