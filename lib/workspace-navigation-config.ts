import { isWorkspaceFunctionKey, workspaceFunctionKeys, type WorkspaceFunctionKey } from './workspace'

export const navigationWorkspaceIds = ['mes', 'mrp', 'erp'] as const
export type NavigationWorkspaceId = (typeof navigationWorkspaceIds)[number]

export const navigationWorkspaceLabels: Record<NavigationWorkspaceId, string> = {
  mes: 'MES',
  mrp: 'MRP',
  erp: 'ERP',
}

export interface WorkspaceNavigationItemConfig {
  functionKey: WorkspaceFunctionKey
  label?: string
}

export interface NavigationWorkspaceConfig {
  enabled: boolean
  items: WorkspaceNavigationItemConfig[]
}

export interface WorkspaceNavigationConfig {
  version: 1
  defaultWorkspace: NavigationWorkspaceId
  workspaces: Record<NavigationWorkspaceId, NavigationWorkspaceConfig>
}

export const sharedWorkspaceFunctionKeys = [
  'dashboard',
  'displaySettings',
  'navigationSettings',
  'aiSettings',
  'archive',
  'auditLogs',
  'dataTools',
  'operators',
  'permissionUsers',
  'permissionGroups',
] as const satisfies readonly WorkspaceFunctionKey[]

const sharedFunctionKeySet = new Set<WorkspaceFunctionKey>(sharedWorkspaceFunctionKeys)

export const configurableWorkspaceFunctionKeys = workspaceFunctionKeys.filter((key) => (
  key !== 'stats' && !sharedFunctionKeySet.has(key)
))

const defaultItems: Record<NavigationWorkspaceId, WorkspaceFunctionKey[]> = {
  mes: [
    'materialManagement', 'bomWorkspace', 'bomUsage', 'workInstructions', 'equipment',
    'orders', 'dispatch', 'flowTransfers', 'employees', 'materialIn', 'stocks', 'locationSettings',
    'unitSettings', 'documentCategories', 'workCenters', 'processTemplates', 'processRoutes',
    'businessSettings', 'sawingCost', 'scanPrint',
  ],
  mrp: [
    'materialManagement', 'bomWorkspace', 'bomUsage', 'orders', 'materialIn', 'salesOrders',
    'stocks', 'suppliers', 'customers', 'locationSettings', 'unitSettings', 'workCenters',
    'processTemplates', 'processRoutes', 'businessSettings',
  ],
  erp: [
    'materialManagement', 'workInstructions', 'materialIn', 'salesOrders', 'shipment', 'return',
    'stocks', 'suppliers', 'customers', 'employees', 'locationSettings', 'unitSettings',
    'businessSettings',
  ],
}

function defaultWorkspaceItems(workspace: NavigationWorkspaceId) {
  return defaultItems[workspace].map((functionKey) => ({ functionKey }))
}

export function createDefaultWorkspaceNavigationConfig(): WorkspaceNavigationConfig {
  return {
    version: 1,
    defaultWorkspace: 'mes',
    workspaces: {
      mes: { enabled: true, items: defaultWorkspaceItems('mes') },
      mrp: { enabled: true, items: defaultWorkspaceItems('mrp') },
      erp: { enabled: true, items: defaultWorkspaceItems('erp') },
    },
  }
}

export const defaultWorkspaceNavigationConfig = createDefaultWorkspaceNavigationConfig()

function normalizeLabel(value: unknown) {
  if (typeof value !== 'string') return undefined
  const label = value.trim().slice(0, 20)
  return label || undefined
}

function normalizeItems(value: unknown): WorkspaceNavigationItemConfig[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<WorkspaceFunctionKey>()
  const items: WorkspaceNavigationItemConfig[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const functionKey = (candidate as { functionKey?: unknown }).functionKey
    if (typeof functionKey !== 'string' || !isWorkspaceFunctionKey(functionKey)) continue
    if (!configurableWorkspaceFunctionKeys.includes(functionKey) || seen.has(functionKey)) continue
    seen.add(functionKey)
    const label = normalizeLabel((candidate as { label?: unknown }).label)
    items.push(label ? { functionKey, label } : { functionKey })
  }
  return items
}

function isWorkspaceId(value: unknown): value is NavigationWorkspaceId {
  return typeof value === 'string' && navigationWorkspaceIds.includes(value as NavigationWorkspaceId)
}

export function normalizeWorkspaceNavigationConfig(value: unknown): WorkspaceNavigationConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { defaultWorkspace?: unknown; workspaces?: unknown }
    : {}
  const sourceWorkspaces = source.workspaces && typeof source.workspaces === 'object' && !Array.isArray(source.workspaces)
    ? source.workspaces as Record<string, unknown>
    : {}

  const workspaces = Object.fromEntries(navigationWorkspaceIds.map((workspace) => {
    const raw = sourceWorkspaces[workspace]
    const rawWorkspace = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as { enabled?: unknown; items?: unknown }
      : undefined
    return [workspace, {
      enabled: rawWorkspace ? rawWorkspace.enabled !== false : true,
      items: rawWorkspace ? normalizeItems(rawWorkspace.items) : defaultWorkspaceItems(workspace),
    }]
  })) as Record<NavigationWorkspaceId, NavigationWorkspaceConfig>

  for (const functionKey of configurableWorkspaceFunctionKeys) {
    const assigned = navigationWorkspaceIds.some((workspace) => (
      workspaces[workspace].items.some((item) => item.functionKey === functionKey)
    ))
    if (assigned) continue
    const defaults = navigationWorkspaceIds.filter((workspace) => defaultItems[workspace].includes(functionKey))
    const targets = defaults.length > 0 ? defaults : ['mes'] as NavigationWorkspaceId[]
    for (const workspace of targets) workspaces[workspace].items.push({ functionKey })
  }

  if (!navigationWorkspaceIds.some((workspace) => workspaces[workspace].enabled)) {
    workspaces.mes.enabled = true
  }
  const requestedDefault = isWorkspaceId(source.defaultWorkspace) ? source.defaultWorkspace : 'mes'
  const defaultWorkspace = workspaces[requestedDefault].enabled
    ? requestedDefault
    : navigationWorkspaceIds.find((workspace) => workspaces[workspace].enabled) || 'mes'

  return { version: 1, defaultWorkspace, workspaces }
}

export function workspaceContainsFunction(
  config: WorkspaceNavigationConfig,
  workspace: NavigationWorkspaceId,
  functionKey: WorkspaceFunctionKey,
) {
  return sharedFunctionKeySet.has(functionKey)
    || config.workspaces[workspace].items.some((item) => item.functionKey === functionKey)
}

export function workspaceFunctionLabel(
  config: WorkspaceNavigationConfig,
  workspace: NavigationWorkspaceId,
  functionKey: WorkspaceFunctionKey,
  defaultLabel: string,
) {
  if (sharedFunctionKeySet.has(functionKey)) return defaultLabel
  return config.workspaces[workspace].items.find((item) => item.functionKey === functionKey)?.label || defaultLabel
}

export function enabledNavigationWorkspaces(config: WorkspaceNavigationConfig) {
  return navigationWorkspaceIds.filter((workspace) => config.workspaces[workspace].enabled)
}
