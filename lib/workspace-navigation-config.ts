import { isWorkspaceFunctionKey, workspaceFunctionKeys, type WorkspaceFunctionKey } from './workspace'

export const navigationWorkspaceIds = ['mes', 'mrp', 'erp'] as const
export type NavigationWorkspaceId = (typeof navigationWorkspaceIds)[number]

export const navigationWorkspaceLabels: Record<NavigationWorkspaceId, string> = {
  mes: 'MES',
  mrp: 'MRP',
  erp: 'ERP',
}

export const workspaceNavigationGroupKeys = [
  'workspace',
  'materials',
  'production',
  'documents',
  'equipment',
  'logistics',
  'sales',
  'inventory',
  'configuration',
  'system',
  'tools',
  'account',
] as const
export type WorkspaceNavigationGroupKey = (typeof workspaceNavigationGroupKeys)[number]

export interface WorkspaceNavigationItemConfig {
  functionKey: WorkspaceFunctionKey
  label?: string
}

export interface NavigationWorkspaceConfig {
  enabled: boolean
  groupOrder: WorkspaceNavigationGroupKey[]
  items: WorkspaceNavigationItemConfig[]
}

export interface WorkspaceNavigationConfig {
  version: 1
  defaultWorkspace: NavigationWorkspaceId
  workspaces: Record<NavigationWorkspaceId, NavigationWorkspaceConfig>
}

export const sharedWorkspaceFunctionKeys = [
  'dashboard',
  'helpCenter',
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
  !sharedFunctionKeySet.has(key)
))

const defaultItems: Record<NavigationWorkspaceId, WorkspaceFunctionKey[]> = {
  mes: [
    'materialManagement', 'bomWorkspace', 'workInstructions', 'equipment', 'equipmentInspections',
    'orders', 'dispatch', 'flowTransfers', 'qualityTasks', 'employees', 'materialIn', 'stocks', 'stockMovements', 'lotPanorama', 'locationSettings',
    'unitSettings', 'documentCategories', 'workCenters', 'processTemplates', 'processRoutes',
    'sawingCost', 'scanPrint',
  ],
  mrp: ['bomUsage'],
  erp: [
    'salesOrders', 'shipment', 'return', 'suppliers', 'customers', 'businessSettings',
  ],
}

const defaultWorkspaceByFunctionKey = new Map<WorkspaceFunctionKey, NavigationWorkspaceId>(
  navigationWorkspaceIds.flatMap((workspace) => defaultItems[workspace].map((functionKey) => [functionKey, workspace] as const)),
)

function defaultWorkspaceItems(workspace: NavigationWorkspaceId) {
  return defaultItems[workspace].map((functionKey) => ({ functionKey }))
}

function defaultGroupOrder() {
  return [...workspaceNavigationGroupKeys]
}

export function createDefaultWorkspaceNavigationConfig(): WorkspaceNavigationConfig {
  return {
    version: 1,
    defaultWorkspace: 'mes',
    workspaces: {
      mes: { enabled: true, groupOrder: defaultGroupOrder(), items: defaultWorkspaceItems('mes') },
      mrp: { enabled: true, groupOrder: defaultGroupOrder(), items: defaultWorkspaceItems('mrp') },
      erp: { enabled: true, groupOrder: defaultGroupOrder(), items: defaultWorkspaceItems('erp') },
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

function normalizeGroupOrder(value: unknown): WorkspaceNavigationGroupKey[] {
  const configured = Array.isArray(value)
    ? value.filter((candidate): candidate is WorkspaceNavigationGroupKey => (
      typeof candidate === 'string'
      && workspaceNavigationGroupKeys.includes(candidate as WorkspaceNavigationGroupKey)
    ))
    : []
  return [
    ...Array.from(new Set(configured)),
    ...workspaceNavigationGroupKeys.filter((groupKey) => !configured.includes(groupKey)),
  ]
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
      ? raw as { enabled?: unknown; groupOrder?: unknown; items?: unknown }
      : undefined
    return [workspace, {
      enabled: rawWorkspace ? rawWorkspace.enabled !== false : true,
      groupOrder: normalizeGroupOrder(rawWorkspace?.groupOrder),
      items: rawWorkspace ? normalizeItems(rawWorkspace.items) : defaultWorkspaceItems(workspace),
    }]
  })) as Record<NavigationWorkspaceId, NavigationWorkspaceConfig>

  for (const functionKey of configurableWorkspaceFunctionKeys) {
    const configuredOwners = navigationWorkspaceIds.filter((workspace) => (
      workspaces[workspace].items.some((item) => item.functionKey === functionKey)
    ))
    const defaultOwner = defaultWorkspaceByFunctionKey.get(functionKey) || 'mes'
    const owner = configuredOwners.length === 1
      ? configuredOwners[0]
      : configuredOwners.includes(defaultOwner)
        ? defaultOwner
        : configuredOwners[0] || defaultOwner

    for (const workspace of navigationWorkspaceIds) {
      if (workspace === owner) continue
      workspaces[workspace].items = workspaces[workspace].items.filter((item) => item.functionKey !== functionKey)
    }
    if (!workspaces[owner].items.some((item) => item.functionKey === functionKey)) {
      workspaces[owner].items.push({ functionKey })
    }
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

export function workspaceOwnerOfFunction(
  config: WorkspaceNavigationConfig,
  functionKey: WorkspaceFunctionKey,
): NavigationWorkspaceId | null {
  if (sharedFunctionKeySet.has(functionKey)) return null
  return navigationWorkspaceIds.find((workspace) => (
    config.workspaces[workspace].items.some((item) => item.functionKey === functionKey)
  )) || null
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
