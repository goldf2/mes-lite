import type { WorkspaceFunctionItem } from '@/modules/workspace'
import type { SystemSection } from './components/SystemPage'
import {
  pageNavigationGroups,
  registeredPageDefinitions,
  type ApplicationTab,
  type MaterialPageSection,
} from '@/lib/page-registry'
import type { WorkspaceNavigationGroupKey } from '@/lib/workspace-navigation-config'

export type TabType = ApplicationTab
export type MaterialSection = MaterialPageSection

export interface PageContinuityState {
  tab?: TabType
  materialSection?: MaterialSection
  scrollPositions?: Record<string, { contentTop: number; windowTop: number }>
}

export function readPageContinuity(storageKey: string): PageContinuityState {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PageContinuityState
      : {}
  } catch {
    return {}
  }
}

export function writePageContinuity(storageKey: string, update: Partial<PageContinuityState>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...readPageContinuity(storageKey),
      ...update,
    }))
  } catch {
    // 浏览器禁用或限制本地存储时不应阻断业务页面。
  }
}

export type BusinessNavGroupKey = WorkspaceNavigationGroupKey

export const businessNavGroups: Array<{ key: BusinessNavGroupKey; label: string; tabs: TabType[] }> = pageNavigationGroups
  .filter((group) => group.key !== 'account')
  .map((group) => ({
    ...group,
    tabs: Array.from(new Set(registeredPageDefinitions
      .filter((page) => page.primaryNavigation && page.groupKey === group.key)
      .map((page) => page.tab))),
  }))

export interface WorkspaceFunctionDefinition extends WorkspaceFunctionItem {
  tab: TabType
  materialSection?: MaterialSection
  resource: string
  extraResource?: string
}

export const workspaceFunctionCatalog: WorkspaceFunctionDefinition[] = registeredPageDefinitions
  .flatMap((page) => page.workspace ? [{
    key: page.workspace.functionKey,
    label: page.workspace.label,
    groupKey: page.groupKey,
    groupLabel: pageNavigationGroups.find((group) => group.key === page.groupKey)?.label || page.groupKey,
    description: page.description,
    icon: page.workspace.icon,
    tab: page.tab,
    materialSection: page.materialSection,
    resource: page.resource,
    extraResource: page.extraResource,
  }] : [])

export const primaryNavigationItems: Array<{ key: TabType; label: string; resource: string }> = registeredPageDefinitions
  .filter((page) => page.primaryNavigation)
  .map((page) => ({
    key: page.tab,
    label: page.tabLabel || page.title,
    resource: page.resource,
  }))

export const systemSectionByTab: Partial<Record<TabType, SystemSection>> = Object.fromEntries(
  registeredPageDefinitions
    .filter((page) => page.systemSection)
    .map((page) => [page.tab, page.systemSection]),
) as Partial<Record<TabType, SystemSection>>

export const lightweightHiddenResources = new Set<string>(['dispatch'])
