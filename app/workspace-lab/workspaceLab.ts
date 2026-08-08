export type WorkspacePanelId = 'navigation' | 'tools'
export type WorkspaceDockSide = 'left' | 'right'
export type WorkspacePanelPlacement = WorkspaceDockSide | 'popup'
export type WorkspacePresetKey = 'navigation' | 'tools' | 'focus' | 'full' | 'custom'

export interface WorkspacePreference {
  topNavigation: boolean
  topToolbar: boolean
  placements: Record<WorkspacePanelId, WorkspacePanelPlacement>
  leftWidth: number
  rightWidth: number
}

export interface WorkspacePreset {
  key: Exclude<WorkspacePresetKey, 'custom'>
  label: string
  description: string
  preference: WorkspacePreference
}

export const workspaceLabStorageKey = 'mes-lite.workspace-lab.preference.v1'

export const workspacePresets: WorkspacePreset[] = [
  {
    key: 'navigation',
    label: '导航常驻',
    description: '左侧导航固定，工具通过弹窗打开',
    preference: {
      topNavigation: false,
      topToolbar: true,
      placements: { navigation: 'left', tools: 'popup' },
      leftWidth: 248,
      rightWidth: 320,
    },
  },
  {
    key: 'tools',
    label: '工具常驻',
    description: '顶部导航常驻，工具固定在右侧',
    preference: {
      topNavigation: true,
      topToolbar: true,
      placements: { navigation: 'popup', tools: 'right' },
      leftWidth: 248,
      rightWidth: 336,
    },
  },
  {
    key: 'focus',
    label: '专注',
    description: '只保留顶部工具和主显示区域',
    preference: {
      topNavigation: false,
      topToolbar: true,
      placements: { navigation: 'popup', tools: 'popup' },
      leftWidth: 248,
      rightWidth: 320,
    },
  },
  {
    key: 'full',
    label: '完整',
    description: '同时展示导航、顶部区域和右侧工具',
    preference: {
      topNavigation: true,
      topToolbar: true,
      placements: { navigation: 'left', tools: 'right' },
      leftWidth: 248,
      rightWidth: 336,
    },
  },
]

export const defaultWorkspacePreference = workspacePresets[0].preference

export function cloneWorkspacePreference(preference: WorkspacePreference): WorkspacePreference {
  return {
    ...preference,
    placements: { ...preference.placements },
  }
}

export function detectWorkspacePreset(preference: WorkspacePreference): WorkspacePresetKey {
  const preset = workspacePresets.find((item) => (
    item.preference.topNavigation === preference.topNavigation
    && item.preference.topToolbar === preference.topToolbar
    && item.preference.placements.navigation === preference.placements.navigation
    && item.preference.placements.tools === preference.placements.tools
  ))

  return preset?.key || 'custom'
}

export function isWorkspacePreference(value: unknown): value is WorkspacePreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<WorkspacePreference>
  const placements = candidate.placements
  const validPlacement = (placement: unknown) => placement === 'left' || placement === 'right' || placement === 'popup'

  return typeof candidate.topNavigation === 'boolean'
    && typeof candidate.topToolbar === 'boolean'
    && Boolean(placements)
    && validPlacement(placements?.navigation)
    && validPlacement(placements?.tools)
    && Number.isFinite(candidate.leftWidth)
    && Number.isFinite(candidate.rightWidth)
}
