'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Boxes, PencilLine, Search } from 'lucide-react'
import type { CurrentOperator } from '../AuthGate'
import type { NavigationGroup } from '../navigation/NavigationModel'
import {
  businessModuleDefinitions,
  getAvailableBusinessModules,
  getAvailableBusinessApplications,
  getBusinessModuleForFunction,
  useWorkspaceNavigation,
  type BusinessModuleDefinition,
  type BusinessModuleKey,
  type BusinessApplicationKey,
} from '@/modules/workspace'
import {
  businessNavGroups,
  lightweightHiddenResources,
  primaryNavigationItems,
  workspaceFunctionCatalog,
  type BusinessNavGroupKey,
  type MaterialSection,
  type TabType,
} from '../../app-navigation'
import {
  workspaceContainsFunction,
  workspaceFunctionLabel,
} from '@/lib/workspace-navigation-config'
import type { WorkspaceFunctionKey } from '@/lib/workspace'
import { getPageModuleDefinition, resolvePageModuleKey } from '@/lib/page-modules'
import NavigationGlyph from './NavigationGlyph'
import usePageNavigationController from './usePageNavigationController'

const accountMenuKeys = new Set<TabType>(['operators', 'permissionUsers', 'permissionGroups'])
const platformNavigationIds = new Set(['businessWorkbench', 'allFunctions', 'dashboard'])

function readRequestedBusinessModule(): BusinessModuleKey | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  if (url.searchParams.get('page') !== 'businessWorkbench' && url.pathname !== '/platform') return null
  const key = url.searchParams.get('module')
  return businessModuleDefinitions.find((module) => module.key === key)?.key || null
}

interface ApplicationNavigationControllerOptions {
  platformEntry?: boolean
  mesUrl?: string
  platformUrl?: string
  operator: CurrentOperator
  closeSystemMenu: () => void
  closeTransientNavigation: () => void
  recordWorkspaceUsage: (functionKey: WorkspaceFunctionKey) => void
}

export default function useApplicationNavigationController({
  operator,
  platformEntry = false,
  mesUrl,
  platformUrl,
  closeSystemMenu,
  closeTransientNavigation,
  recordWorkspaceUsage,
}: ApplicationNavigationControllerOptions) {
  const hasAnyGrant = Object.values(operator.permissions || {}).some((permission) => permission.canGrant)
  const canRead = (resource: string) => (
    operator.role === 'ADMIN'
    || Boolean(operator.permissions?.[resource]?.canRead)
    || ((resource === 'permissionUsers' || resource === 'permissionGroups') && hasAnyGrant)
  )
  const canCreate = (resource: string) => operator.role === 'ADMIN' || Boolean(operator.permissions?.[resource]?.canCreate)
  const canUpdate = (resource: string) => operator.role === 'ADMIN' || Boolean(operator.permissions?.[resource]?.canUpdate)
  const canDelete = (resource: string) => operator.role === 'ADMIN' || Boolean(operator.permissions?.[resource]?.canDelete)

  const { config: workspaceNavigationConfig, activeWorkspace } = useWorkspaceNavigation()
  const canReadNavItem = (item: { key: TabType; resource: string; adminOnly?: boolean }) => (
    (!item.adminOnly || operator.role === 'ADMIN') && (item.key === 'materials'
      ? canRead('materials') || canRead('bom')
      : canRead(item.resource))
  )
  const readableWorkspaceFunctionItems = workspaceFunctionCatalog.filter((item) => (
    (!item.adminOnly || operator.role === 'ADMIN') && canRead(item.resource) && (!item.extraResource || canRead(item.extraResource))
  ))
  const configuredFunctionOrder = new Map(
    workspaceNavigationConfig.workspaces[activeWorkspace].items.map((item, index) => [item.functionKey, index]),
  )
  const defaultFunctionOrder = new Map(workspaceFunctionCatalog.map((item, index) => [item.key, index]))
  const workspaceFunctionItems = readableWorkspaceFunctionItems
    .filter((item) => workspaceContainsFunction(workspaceNavigationConfig, activeWorkspace, item.key))
    .map((item) => ({
      ...item,
      label: workspaceFunctionLabel(workspaceNavigationConfig, activeWorkspace, item.key, item.label),
    }))
    .sort((left, right) => (
      Number(configuredFunctionOrder.get(left.key) ?? 1000 + Number(defaultFunctionOrder.get(left.key) ?? 999))
      - Number(configuredFunctionOrder.get(right.key) ?? 1000 + Number(defaultFunctionOrder.get(right.key) ?? 999))
    ))
  const availableBusinessModules = getAvailableBusinessModules(workspaceFunctionItems)
  const availableBusinessApplications = getAvailableBusinessApplications(workspaceFunctionItems)
  const visibleWorkspaceTabs = new Set(workspaceFunctionItems.map((item) => item.tab))
  const labelForTab = (item: { key: TabType; label: string }) => {
    if (item.key === 'materials' || item.key === 'allFunctions') return item.label
    return workspaceFunctionItems.find((functionItem) => functionItem.tab === item.key)?.label || item.label
  }
  const rankForTab = (key: TabType) => {
    const ranks = workspaceFunctionItems
      .filter((item) => item.tab === key)
      .map((item) => Number(configuredFunctionOrder.get(item.key) ?? 1000 + Number(defaultFunctionOrder.get(item.key) ?? 999)))
    return ranks.length > 0 ? Math.min(...ranks) : 9999
  }
  const readableBusinessNavItems = primaryNavigationItems
    .filter((item) => canReadNavItem(item) && !accountMenuKeys.has(item.key) && !lightweightHiddenResources.has(item.resource))
    .filter((item) => item.key === 'allFunctions' || visibleWorkspaceTabs.has(item.key))
    .map((item) => ({ ...item, label: labelForTab(item) }))
    .sort((left, right) => rankForTab(left.key) - rankForTab(right.key))
  const readableSystemNavItems = primaryNavigationItems
    .filter((item) => canRead(item.resource) && accountMenuKeys.has(item.key) && !lightweightHiddenResources.has(item.resource))
    .map((item) => ({ ...item, label: labelForTab(item) }))
  const materialSectionItems = [
    { key: 'materials' as const, functionKey: 'materialManagement' as const, label: '物料管理', visible: canRead('materials') },
    { key: 'bomWorkspace' as const, functionKey: 'bomWorkspace' as const, label: 'BOM 设置', visible: canRead('bom') },
    { key: 'bomUsage' as const, functionKey: 'bomUsage' as const, label: 'BOM 全览', visible: canRead('bom') },
  ].filter((item) => item.visible)
    .filter((item) => workspaceContainsFunction(workspaceNavigationConfig, activeWorkspace, item.functionKey))
    .map((item) => ({
      ...item,
      label: workspaceFunctionLabel(workspaceNavigationConfig, activeWorkspace, item.functionKey, item.label),
    }))
  const fallbackInitialTab = readableBusinessNavItems.find((item) => item.key === 'dashboard')?.key
    ?? readableBusinessNavItems[0]?.key
    ?? readableSystemNavItems[0]?.key
    ?? 'dashboard'
  const defaultMaterialSection: MaterialSection = canRead('materials') ? 'materials' : 'bomUsage'
  const restorableMaterialSections = [
    canRead('materials') ? 'materials' : null,
    canRead('bom') ? 'bomWorkspace' : null,
    canRead('bom') ? 'bomUsage' : null,
  ].filter((section): section is MaterialSection => section !== null)
  const [selectedBusinessModuleKey, setSelectedBusinessModuleKey] = useState<BusinessModuleKey | null>(readRequestedBusinessModule)
  const selectedBusinessPageContext = availableBusinessModules.find((module) => module.key === selectedBusinessModuleKey)?.key || 'overview'

  const {
    tab,
    setTab,
    materialSection,
    setMaterialSection,
    bomEditorTarget,
    openBomEditor,
    clearBomEditorTarget,
    pageContentRef,
    pageLocationKey,
  } = usePageNavigationController({
    operatorId: operator.id,
    allowedTabs: Array.from(new Set([
      ...readableBusinessNavItems.map((item) => item.key),
      ...readableSystemNavItems.map((item) => item.key),
      ...workspaceFunctionItems.filter((item) => !item.externalHref).map((item) => item.tab),
    ])),
    fallbackTab: fallbackInitialTab,
    defaultMaterialSection,
    restorableMaterialSections,
    urlMaterialSections: materialSectionItems.map((item) => item.key),
    pageContextKey: selectedBusinessPageContext,
    entryTab: platformEntry ? 'businessWorkbench' : 'dashboard',
  })

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const navOrderLoadedRef = useRef(false)
  const readableBusinessNavItemsRef = useRef(readableBusinessNavItems)
  readableBusinessNavItemsRef.current = readableBusinessNavItems
  const [navItems, setNavItems] = useState<{ key: TabType; label: string }[]>(readableBusinessNavItems)

  const tabLabels: Record<string, string> = Object.fromEntries(
    [...primaryNavigationItems, ...readableBusinessNavItems, ...readableSystemNavItems].map((item) => [item.key, item.label]),
  )
  tabLabels.create = '创建生产订单'
  tabLabels.detail = '生产订单详情'
  const activePageModule = getPageModuleDefinition(resolvePageModuleKey(tab, materialSection))
  const activeFunctionKey: WorkspaceFunctionKey = tab === 'materials'
    ? materialSection === 'bomWorkspace' ? 'bomWorkspace' : materialSection === 'bomUsage' ? 'bomUsage' : 'materialManagement'
    : tab === 'create' || tab === 'detail'
      ? 'orders'
      : tab === 'allFunctions'
        ? 'businessWorkbench'
        : workspaceFunctionCatalog.find((item) => item.tab === tab)?.key || 'dashboard'
  const activeBusinessModule: BusinessModuleDefinition | null = tab === 'businessWorkbench'
    ? availableBusinessModules.find((module) => module.key === selectedBusinessModuleKey) || null
    : tab === 'dashboard' || tab === 'allFunctions'
      ? null
      : getBusinessModuleForFunction(activeFunctionKey) || null
  const activeBusinessModuleKey = activeBusinessModule?.key
  const isPlatformSurface = (tab === 'businessWorkbench' && !activeBusinessModule) || (platformEntry && tab === 'allFunctions')
  const activeBusinessApplication = isPlatformSurface ? null : availableBusinessApplications.find((application) => (
    application.ownerApp === (activeBusinessModule?.ownerApp || 'mes')
  )) || null
  const activeTabLabel = tab === 'materials'
    ? materialSectionItems.find((item) => item.key === materialSection)?.label || '物料与 BOM'
    : tab === 'businessWorkbench' && activeBusinessModule
      ? activeBusinessModule.label
      : tabLabels[tab] || 'MES-lite'
  const activeSystemTab = readableSystemNavItems.some((item) => item.key === tab)
  const activeBusinessGroupKey: BusinessNavGroupKey = tab === 'create' || tab === 'detail'
    ? 'production'
    : businessNavGroups.find((group) => group.tabs.includes(tab))?.key || 'workspace'
  const configuredGroupOrder = new Map(
    workspaceNavigationConfig.workspaces[activeWorkspace].groupOrder.map((groupKey, index) => [groupKey, index]),
  )
  const visibleBusinessGroups = businessNavGroups
    .map((group) => ({
      ...group,
      items: navItems.filter((item) => group.tabs.includes(item.key)),
      workspaceOrder: Number(configuredGroupOrder.get(group.key) ?? 10000 + businessNavGroups.indexOf(group)),
    }))
    .filter((group) => group.items.length > 0)
    .sort((left, right) => left.workspaceOrder - right.workspaceOrder)
  const navigationOrderStorageKey = `mes-lite.nav.order.${activeWorkspace}`
  const readableNavigationSignature = readableBusinessNavItems.map((item) => `${item.key}:${item.label}`).join('|')
  const activeMaterialSectionVisible = materialSectionItems.some((item) => item.key === materialSection)
  const firstMaterialSectionKey = materialSectionItems[0]?.key
  const activeGroupLabel = activeSystemTab
    ? '账号与权限'
    : businessNavGroups.find((group) => group.key === activeBusinessGroupKey)?.label || 'MES-lite'
  const activeFunctionPath = activeBusinessModule
    ? tab === 'businessWorkbench' ? activeBusinessModule.label : `${activeBusinessModule.label} / ${activeTabLabel}`
    : `${activeGroupLabel} / ${activeTabLabel}`

  useEffect(() => {
    const url = new URL(window.location.href)
    if (tab === 'businessWorkbench' && activeBusinessModuleKey) url.searchParams.set('module', activeBusinessModuleKey)
    else url.searchParams.delete('module')
    window.history.replaceState(window.history.state, '', url)
  }, [activeBusinessModuleKey, tab])

  useEffect(() => {
    const currentReadableItems = readableBusinessNavItemsRef.current
    const savedOrder = window.localStorage.getItem(navigationOrderStorageKey)
      || (activeWorkspace === 'mes' ? window.localStorage.getItem('mes-lite.nav.order') : null)
    if (savedOrder) {
      try {
        const savedKeys = JSON.parse(savedOrder) as TabType[]
        const itemByKey = new Map(currentReadableItems.map((item) => [item.key, item]))
        const ordered = savedKeys
          .map((key) => itemByKey.get(key))
          .filter(Boolean) as { key: TabType; label: string }[]
        const missing = currentReadableItems.filter((item) => !savedKeys.includes(item.key))
        setNavItems([...ordered, ...missing])
      } catch {
        setNavItems(currentReadableItems)
      }
    } else {
      setNavItems(currentReadableItems)
    }
    navOrderLoadedRef.current = true
  }, [activeWorkspace, navigationOrderStorageKey, readableNavigationSignature])

  useEffect(() => {
    if (!navOrderLoadedRef.current) return
    window.localStorage.setItem(navigationOrderStorageKey, JSON.stringify(navItems.map((item) => item.key)))
  }, [navItems, navigationOrderStorageKey])

  useEffect(() => {
    if (tab !== 'materials' || activeMaterialSectionVisible) return
    if (firstMaterialSectionKey) setMaterialSection(firstMaterialSectionKey)
    else setTab('dashboard')
  }, [activeMaterialSectionVisible, firstMaterialSectionKey, setMaterialSection, setTab, tab])

  useEffect(() => {
    if (workspaceContainsFunction(workspaceNavigationConfig, activeWorkspace, activeFunctionKey)) return
    setTab('dashboard')
  }, [activeFunctionKey, activeWorkspace, setTab, workspaceNavigationConfig])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileNavOpen])

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, index: number) => {
    setDraggedIndex(index)
    event.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (event: DragEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault()
    setDragOverIndex(index)
  }
  const handleDragLeave = () => setDragOverIndex(null)
  const handleDrop = (event: DragEvent<HTMLButtonElement>, dropIndex: number) => {
    event.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null)
      setDraggedIndex(null)
      return
    }
    const newItems = [...navItems]
    const [draggedItem] = newItems.splice(draggedIndex, 1)
    newItems.splice(dropIndex, 0, draggedItem)
    setNavItems(newItems)
    setDragOverIndex(null)
    setDraggedIndex(null)
  }

  const closeNavigationSurfaces = () => {
    setMobileNavOpen(false)
    closeTransientNavigation()
    closeSystemMenu()
  }
  const openBusinessPlatform = () => {
    if (!workspaceFunctionItems.some((item) => item.key === 'businessWorkbench')) return
    const destination = new URL(platformUrl || '/platform', window.location.origin)
    if (!platformEntry || destination.origin !== window.location.origin) {
      window.location.assign(destination.href)
      return
    }
    setSelectedBusinessModuleKey(null)
    const url = new URL(window.location.href)
    url.searchParams.set('page', 'businessWorkbench')
    url.searchParams.delete('module')
    url.searchParams.delete('task')
    window.history.replaceState(window.history.state, '', url)
    setTab('businessWorkbench')
    closeNavigationSurfaces()
  }
  const openBusinessModule = (moduleKey: BusinessModuleKey) => {
    if (!availableBusinessModules.some((module) => module.key === moduleKey)) return
    const destination = new URL(platformUrl || '/platform', window.location.origin)
    destination.searchParams.set('page', 'businessWorkbench')
    destination.searchParams.set('module', moduleKey)
    if (!platformEntry || destination.origin !== window.location.origin) {
      window.location.assign(destination.href)
      return
    }
    setSelectedBusinessModuleKey(moduleKey)
    const url = new URL(window.location.href)
    url.searchParams.set('page', 'businessWorkbench')
    url.searchParams.set('module', moduleKey)
    url.searchParams.delete('task')
    window.history.replaceState(window.history.state, '', url)
    setTab('businessWorkbench')
    closeNavigationSurfaces()
  }
  const openWorkspaceFunction = (functionKey: WorkspaceFunctionKey, task?: string) => {
    const target = workspaceFunctionItems.find((item) => item.key === functionKey)
    if (!target) return
    if (functionKey === 'businessWorkbench') {
      openBusinessPlatform()
      return
    }
    if (target.externalHref) {
      closeNavigationSurfaces()
      recordWorkspaceUsage(functionKey)
      window.location.assign(target.externalHref)
      return
    }
    if (platformEntry) {
      const destination = new URL('/', mesUrl || window.location.origin)
      destination.searchParams.set('page', target.tab)
      if (target.materialSection) destination.searchParams.set('section', target.materialSection)
      if (task) destination.searchParams.set('task', task)
      recordWorkspaceUsage(functionKey)
      window.location.assign(destination.href)
      return
    }
    setSelectedBusinessModuleKey(null)
    if (target.materialSection) setMaterialSection(target.materialSection)
    const url = new URL(window.location.href)
    url.searchParams.delete('module')
    if (task) url.searchParams.set('task', task)
    else url.searchParams.delete('task')
    window.history.replaceState(window.history.state, '', url)
    setTab(target.tab)
    closeNavigationSurfaces()
    recordWorkspaceUsage(functionKey)
  }
  const openBusinessApplication = (key: BusinessApplicationKey) => {
    const application = availableBusinessApplications.find((item) => item.key === key)
    if (!application) return
    if (application.ownerApp === 'mes') {
      const home = application.items.find((item) => item.key === 'dashboard') || application.items[0]
      if (home) openWorkspaceFunction(home.key)
      return
    }
    const destinationModule = application.modules[0]
    if (destinationModule) openBusinessModule(destinationModule.key)
  }
  const navigateToTab = (nextTab: TabType, nextMaterialSection?: MaterialSection) => {
    if (nextTab === 'businessWorkbench') {
      openBusinessPlatform()
      return
    }
    if (nextTab === 'allFunctions') {
      const destination = new URL(platformUrl || '/platform', window.location.origin)
      destination.searchParams.set('page', 'allFunctions')
      if ((!platformEntry && tab === 'businessWorkbench') || (platformEntry && destination.origin !== window.location.origin)) {
        window.location.assign(destination.href)
        return
      }
      setSelectedBusinessModuleKey(null)
      setTab('allFunctions')
      closeNavigationSurfaces()
      return
    }
    const target = nextTab === 'materials'
      ? workspaceFunctionItems.find((item) => item.materialSection === (nextMaterialSection || 'materials'))
      : workspaceFunctionItems.find((item) => item.tab === nextTab)
    if (target) {
      openWorkspaceFunction(target.key)
      return
    }
    setTab(nextTab)
    closeNavigationSurfaces()
  }
  const allNavigationGroups: NavigationGroup[] = visibleBusinessGroups.map((group) => {
    const firstItem = group.tabs.map((key) => group.items.find((item) => item.key === key)).find(Boolean)
    const groupActive = !activeSystemTab && group.key === activeBusinessGroupKey
    const items = group.key === 'materials'
      ? materialSectionItems.map((section) => {
          const SectionIcon = section.key === 'materials' ? Boxes : section.key === 'bomWorkspace' ? PencilLine : Search
          return {
            id: `materials:${section.key}`,
            label: section.label,
            active: tab === 'materials' && materialSection === section.key,
            icon: <SectionIcon aria-hidden="true" className="h-4 w-4 shrink-0" />,
            shortcutKey: 'materials',
            onClick: () => navigateToTab('materials', section.key),
          }
        })
      : group.items.map((item) => {
          const index = navItems.findIndex((navItem) => navItem.key === item.key)
          return {
            id: item.key,
            label: item.label,
            active: tab === item.key || (item.key === 'orders' && (tab === 'create' || tab === 'detail')),
            icon: <NavigationGlyph icon={item.key} />,
            shortcutKey: item.key,
            draggable: true,
            dragState: draggedIndex === index ? 'dragging' as const : dragOverIndex === index ? 'target' as const : 'idle' as const,
            onDragStart: (event: DragEvent<HTMLButtonElement>) => handleDragStart(event, index),
            onDragOver: (event: DragEvent<HTMLButtonElement>) => handleDragOver(event, index),
            onDragLeave: handleDragLeave,
            onDrop: (event: DragEvent<HTMLButtonElement>) => handleDrop(event, index),
            onClick: () => navigateToTab(item.key),
          }
        })

    return {
      id: group.key,
      label: group.label,
      icon: <NavigationGlyph icon={firstItem?.key || group.key} />,
      active: groupActive,
      items,
      onClick: () => {
        if (firstItem) navigateToTab(firstItem.key)
      },
    }
  })

  if (readableSystemNavItems.length > 0) {
    allNavigationGroups.push({
      id: 'account',
      label: '账号与权限',
      icon: <NavigationGlyph icon="operators" />,
      active: activeSystemTab,
      items: readableSystemNavItems.map((item) => ({
        id: item.key,
        label: item.label,
        active: tab === item.key,
        icon: <NavigationGlyph icon={item.key} />,
        shortcutKey: item.key,
        onClick: () => navigateToTab(item.key),
      })),
      onClick: () => navigateToTab(readableSystemNavItems[0].key),
    })
  }
  for (const entry of workspaceFunctionItems.filter((item) => item.externalHref)) {
    let group = allNavigationGroups.find((item) => item.id === entry.groupKey)
    if (!group) {
      group = {
        id: entry.groupKey,
        label: entry.groupLabel,
        icon: <NavigationGlyph icon={entry.resource} />,
        active: false,
        items: [],
        onClick: () => openWorkspaceFunction(entry.key),
      }
      allNavigationGroups.push(group)
    }
    group.items.push({
      id: entry.key,
      label: entry.label,
      active: false,
      icon: <NavigationGlyph icon={entry.resource} />,
      shortcutKey: entry.key,
      onClick: () => openWorkspaceFunction(entry.key),
    })
  }
  allNavigationGroups.sort((left, right) => (
    Number(configuredGroupOrder.get(left.id as BusinessNavGroupKey) ?? 10000)
    - Number(configuredGroupOrder.get(right.id as BusinessNavGroupKey) ?? 10000)
  ))
  const navigationFunction = (itemId: string) => {
    const section = materialSectionItems.find((item) => itemId === `materials:${item.key}`)
    return workspaceFunctionItems.find((item) => section
      ? item.key === section.functionKey
      : item.key === itemId || (!item.externalHref && item.tab === itemId))
  }
  const navigationGroups: NavigationGroup[] = isPlatformSurface ? [] : allNavigationGroups.flatMap((group) => {
    const items = group.items.filter((item) => {
      if (item.id === 'businessWorkbench') return false
      if (item.id === 'dashboard' || item.id === 'allFunctions') return activeBusinessApplication?.ownerApp === 'mes'
      const entry = navigationFunction(item.id)
      return Boolean(entry && (activeBusinessApplication?.ownerApp === 'data-platform' ? entry.externalHref : !entry.externalHref))
    })
    return items.length > 0 ? [{ ...group, items, active: items.some((item) => item.active), onClick: items[0].onClick }] : []
  })
  const activeNavigationGroup = navigationGroups.find((group) => group.active)
  const visibleMobileItems = navigationGroups.flatMap((group) => group.items)
  const moduleMobileItems = visibleMobileItems.filter((item) => !platformNavigationIds.has(item.id))
  const mobilePrimaryItems = (moduleMobileItems.length > 0 ? moduleMobileItems : visibleMobileItems).slice(0, 4).map((item) => ({
    key: item.id,
    label: item.label,
    active: item.active,
    onClick: item.onClick,
  }))

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    activeWorkspace,
    workspaceNavigationConfig,
    workspaceFunctionItems,
    availableBusinessModules,
    availableBusinessApplications,
    activeBusinessApplication,
    isPlatformSurface,
    openBusinessApplication,
    activeBusinessModule,
    openBusinessModule,
    openBusinessPlatform,
    tab,
    setTab,
    materialSection,
    setMaterialSection,
    bomEditorTarget,
    openBomEditor,
    clearBomEditorTarget,
    pageContentRef,
    pageLocationKey,
    activeTabLabel,
    activePageModule,
    activeFunctionPath,
    navigationGroups,
    activeNavigationGroup,
    mobilePrimaryItems,
    mobileNavOpen,
    setMobileNavOpen,
    openWorkspaceFunction,
    navigateToTab,
  }
}
