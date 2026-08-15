import { isWorkspaceFunctionKey, workspaceFunctionKeys, type WorkspaceFunctionKey } from './workspace'

export const navigationWorkspaceIds = ['mes', 'mrp', 'erp'] as const
export type NavigationWorkspaceId = (typeof navigationWorkspaceIds)[number]

export const navigationWorkspaceLabels: Record<NavigationWorkspaceId, string> = {
  mes: 'MES-lite',
  mrp: 'MRP',
  erp: 'ERP',
}

export interface NavigationModuleButtonConfig {
  visible: boolean
  label: string
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
  moduleButtons: Record<NavigationWorkspaceId, NavigationModuleButtonConfig>
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
    'materialManagement', 'bomWorkspace', 'workInstructions', 'equipment', 'equipmentInspections', 'equipmentMaintenance',
    'orders', 'dispatch', 'flowTransfers', 'qualityTasks', 'employees', 'materialIn', 'stocks', 'stockMovements', 'lotPanorama', 'locationSettings',
    'unitSettings', 'documentCategories', 'workCenters', 'processTemplates', 'processRoutes',
    'sawingCost', 'scanPrint', 'bomUsage', 'salesOrders', 'shipment', 'return', 'suppliers', 'customers', 'businessSettings',
  ],
  mrp: [],
  erp: [],
}

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
    moduleButtons: {
      mes: { visible: true, label: navigationWorkspaceLabels.mes },
      mrp: { visible: true, label: navigationWorkspaceLabels.mrp },
      erp: { visible: true, label: navigationWorkspaceLabels.erp },
    },
    workspaces: {
      mes: { enabled: true, groupOrder: defaultGroupOrder(), items: defaultWorkspaceItems('mes') },
      mrp: { enabled: false, groupOrder: defaultGroupOrder(), items: [] },
      erp: { enabled: false, groupOrder: defaultGroupOrder(), items: [] },
    },
  }
}

export const defaultWorkspaceNavigationConfig = createDefaultWorkspaceNavigationConfig()

function normalizeLabel(value: unknown) {
  if (typeof value !== 'string') return undefined
  const label = value.trim().slice(0, 20)
  return label || undefined
}

function normalizeModuleButton(
  value: unknown,
  moduleId: NavigationWorkspaceId,
): NavigationModuleButtonConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { visible?: unknown; label?: unknown }
    : {}
  return {
    visible: moduleId === 'mes' ? true : source.visible !== false,
    label: normalizeLabel(source.label) || navigationWorkspaceLabels[moduleId],
  }
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

export function normalizeWorkspaceNavigationConfig(value: unknown): WorkspaceNavigationConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { defaultWorkspace?: unknown; moduleButtons?: unknown; workspaces?: unknown }
    : {}
  const sourceModuleButtons = source.moduleButtons && typeof source.moduleButtons === 'object' && !Array.isArray(source.moduleButtons)
    ? source.moduleButtons as Record<string, unknown>
    : {}
  const sourceWorkspaces = source.workspaces && typeof source.workspaces === 'object' && !Array.isArray(source.workspaces)
    ? source.workspaces as Record<string, unknown>
    : {}

  const configuredItems = navigationWorkspaceIds.flatMap((workspace) => {
    const raw = sourceWorkspaces[workspace]
    const rawWorkspace = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as { groupOrder?: unknown; items?: unknown }
      : undefined
    return normalizeItems(rawWorkspace?.items)
  })
  const seen = new Set<WorkspaceFunctionKey>()
  const mergedItems = configuredItems.filter((item) => {
    if (seen.has(item.functionKey)) return false
    seen.add(item.functionKey)
    return true
  })
  for (const functionKey of defaultItems.mes) {
    if (seen.has(functionKey)) continue
    seen.add(functionKey)
    mergedItems.push({ functionKey })
  }

  const rawMes = sourceWorkspaces.mes
  const mesWorkspace = rawMes && typeof rawMes === 'object' && !Array.isArray(rawMes)
    ? rawMes as { groupOrder?: unknown }
    : undefined
  const workspaces: Record<NavigationWorkspaceId, NavigationWorkspaceConfig> = {
    mes: {
      enabled: true,
      groupOrder: normalizeGroupOrder(mesWorkspace?.groupOrder),
      items: mergedItems,
    },
    mrp: { enabled: false, groupOrder: defaultGroupOrder(), items: [] },
    erp: { enabled: false, groupOrder: defaultGroupOrder(), items: [] },
  }

  return {
    version: 1,
    defaultWorkspace: 'mes',
    moduleButtons: {
      mes: normalizeModuleButton(sourceModuleButtons.mes, 'mes'),
      mrp: normalizeModuleButton(sourceModuleButtons.mrp, 'mrp'),
      erp: normalizeModuleButton(sourceModuleButtons.erp, 'erp'),
    },
    workspaces,
  }
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
