export const CONTRAST_MODE_VALUES = ['soft', 'standard', 'high'] as const

export type ContrastMode = (typeof CONTRAST_MODE_VALUES)[number]

export interface ContrastModeDefinition {
  id: ContrastMode
  label: string
  description: string
  preview: {
    canvas: string
    surface: string
    border: string
    text: string
    muted: string
  }
}

export const DEFAULT_CONTRAST_MODE: ContrastMode = 'standard'

export const contrastModes: ContrastModeDefinition[] = [
  {
    id: 'soft',
    label: '柔和',
    description: '弱化边界和层级，适合低干扰浏览。',
    preview: { canvas: '#fafafa', surface: '#ffffff', border: '#eceef1', text: '#1f2937', muted: '#78808c' },
  },
  {
    id: 'standard',
    label: '标准',
    description: '平衡信息层级与长时间操作舒适度。',
    preview: { canvas: '#f9fafb', surface: '#ffffff', border: '#e5e7eb', text: '#111827', muted: '#6b7280' },
  },
  {
    id: 'high',
    label: '高对比',
    description: '强化标题、正文、边框和容器区隔。',
    preview: { canvas: '#ffffff', surface: '#ffffff', border: '#94a3b8', text: '#020617', muted: '#334155' },
  },
]

export function isContrastMode(value: unknown): value is ContrastMode {
  return CONTRAST_MODE_VALUES.includes(value as ContrastMode)
}

export function normalizeContrastMode(value: unknown): ContrastMode {
  return isContrastMode(value) ? value : DEFAULT_CONTRAST_MODE
}

export function applyContrastMode(value: ContrastMode) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.mesContrast = value
}
