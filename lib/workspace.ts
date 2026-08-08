export const workspaceModes = ['DEFAULT', 'SMART', 'CUSTOM'] as const

export type WorkspaceMode = (typeof workspaceModes)[number]

export const workspaceFunctionKeys = [
  'dashboard',
  'materialManagement',
  'bomWorkspace',
  'bomUsage',
  'workInstructions',
  'equipment',
  'orders',
  'dispatch',
  'stats',
  'flowTransfers',
  'employees',
  'materialIn',
  'salesOrders',
  'shipment',
  'return',
  'stocks',
  'suppliers',
  'customers',
  'locationSettings',
  'unitSettings',
  'documentCategories',
  'workCenters',
  'processTemplates',
  'processRoutes',
  'businessSettings',
  'displaySettings',
  'navigationSettings',
  'aiSettings',
  'sawingCost',
  'scanPrint',
  'archive',
  'auditLogs',
  'dataTools',
  'operators',
  'permissionUsers',
  'permissionGroups',
] as const

export type WorkspaceFunctionKey = (typeof workspaceFunctionKeys)[number]

export interface WorkspaceFunctionUsage {
  functionKey: WorkspaceFunctionKey
  useCount: number
  lastUsedAt: string | null
}

export interface WorkspacePreferenceValue {
  mode: WorkspaceMode
  layout: WorkspaceFunctionKey[]
  pinned: WorkspaceFunctionKey[]
  usage: WorkspaceFunctionUsage[]
}

export const defaultWorkspaceLayout: WorkspaceFunctionKey[] = [
  'stats',
  'materialIn',
  'salesOrders',
  'shipment',
  'materialManagement',
  'bomWorkspace',
  'stocks',
  'workInstructions',
  'orders',
]

export const defaultWorkspacePreference: WorkspacePreferenceValue = {
  mode: 'DEFAULT',
  layout: defaultWorkspaceLayout,
  pinned: [],
  usage: [],
}

export const maxWorkspaceShortcuts = 10

const workspaceFunctionKeySet = new Set<string>(workspaceFunctionKeys)

export function isWorkspaceFunctionKey(value: string): value is WorkspaceFunctionKey {
  return workspaceFunctionKeySet.has(value)
}

export function normalizeWorkspaceFunctionKeys(values: unknown): WorkspaceFunctionKey[] {
  if (!Array.isArray(values)) return []
  const migratedValues = values.map((value) => value === 'systemSettings' ? 'businessSettings' : value)
  return Array.from(new Set(migratedValues.filter((value): value is WorkspaceFunctionKey => (
    typeof value === 'string' && isWorkspaceFunctionKey(value)
  ))))
}

export function rankWorkspaceFunctionKeys({
  mode,
  availableKeys,
  layout,
  pinned,
  usage,
}: WorkspacePreferenceValue & { availableKeys: WorkspaceFunctionKey[] }) {
  const available = normalizeWorkspaceFunctionKeys(availableKeys)
  const availableSet = new Set(available)
  const defaultOrder = [
    ...defaultWorkspaceLayout.filter((key) => availableSet.has(key)),
    ...available.filter((key) => !defaultWorkspaceLayout.includes(key)),
  ]
  const defaultShortcutCount = Math.min(defaultWorkspaceLayout.length, available.length)

  if (mode === 'CUSTOM') {
    const selected = normalizeWorkspaceFunctionKeys(layout).filter((key) => availableSet.has(key))
    return (selected.length > 0 ? selected : defaultOrder).slice(0, maxWorkspaceShortcuts)
  }

  if (mode === 'SMART') {
    const usageByKey = new Map(usage.map((item) => [item.functionKey, item]))
    const defaultIndex = new Map(defaultOrder.map((key, index) => [key, index]))
    const pinnedKeys = normalizeWorkspaceFunctionKeys(pinned).filter((key) => availableSet.has(key))
    const pinnedSet = new Set(pinnedKeys)
    const ranked = available
      .filter((key) => !pinnedSet.has(key))
      .sort((left, right) => {
        const leftUsage = usageByKey.get(left)
        const rightUsage = usageByKey.get(right)
        const countDiff = Number(rightUsage?.useCount || 0) - Number(leftUsage?.useCount || 0)
        if (countDiff !== 0) return countDiff
        const timeDiff = new Date(rightUsage?.lastUsedAt || 0).getTime() - new Date(leftUsage?.lastUsedAt || 0).getTime()
        if (timeDiff !== 0) return timeDiff
        return Number(defaultIndex.get(left) ?? 999) - Number(defaultIndex.get(right) ?? 999)
      })
    return [...pinnedKeys, ...ranked].slice(0, maxWorkspaceShortcuts)
  }

  return defaultOrder.slice(0, defaultShortcutCount)
}
