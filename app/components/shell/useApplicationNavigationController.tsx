'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Boxes, PencilLine, Search } from 'lucide-react'
import type { CurrentOperator } from '../AuthGate'
import type { NavigationGroup, NavigationItem } from '../navigation/NavigationModel'
import { useWorkspaceNavigation } from '@/modules/workspace'
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
  type NavigationWorkspaceId,
} from '@/lib/workspace-navigation-config'
import type { WorkspaceFunctionKey } from '@/lib/workspace'
import { getPageModuleDefinition, resolvePageModuleKey } from '@/lib/page-modules'
import NavigationGlyph from './NavigationGlyph'
import usePageNavigationController from './usePageNavigationController'

const accountMenuKeys = new Set<TabType>(['operators', 'permissionUsers', 'permissionGroups'])

interface ApplicationNavigationControllerOptions {
  operator: CurrentOperator
  closeSystemMenu: () => void
  closeTransientNavigation: () => void
  recordWorkspaceUsage: (functionKey: WorkspaceFunctionKey) => void
}

export default function useApplicationNavigationController({
  operator,
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

  const { config: workspaceNavigationConfig, activeWorkspace, setActiveWorkspace } = useWorkspaceNavigation()
  const canReadNavItem = (item: { key: TabType; resource: string }) => (
    item.key === 'materials'
      ? canRead('materials') || canRead('bomCost')
      : canRead(item.resource)
  )
  const readableWorkspaceFunctionItems = workspaceFunctionCatalog.filter((item) => (
    canRead(item.resource) && (!item.extraResource || canRead(item.extraResource))
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
    { key: 'bomWorkspace' as const, functionKey: 'bomWorkspace' as const, label: 'BOM 设置', visible: canRead('materials') && canRead('bomCost') },
    { key: 'bomUsage' as const, functionKey: 'bomUsage' as const, label: 'BOM 全览', visible: canRead('bomCost') },
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
    canRead('materials') && canRead('bomCost') ? 'bomWorkspace' : null,
    canRead('bomCost') ? 'bomUsage' : null,
  ].filter((section): section is MaterialSection => section !== null)

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
    allowedTabs: [...readableBusinessNavItems, ...readableSystemNavItems].map((item) => item.key),
    fallbackTab: fallbackInitialTab,
    defaultMaterialSection,
    restorableMaterialSections,
    urlMaterialSections: materialSectionItems.map((item) => item.key),
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
  const activeTabLabel = tab === 'materials'
    ? materialSectionItems.find((item) => item.key === materialSection)?.label || '物料与 BOM'
    : tabLabels[tab] || 'MES-lite'
  const activePageModule = getPageModuleDefinition(resolvePageModuleKey(tab, materialSection))
  const activeFunctionKey: WorkspaceFunctionKey = tab === 'materials'
    ? materialSection === 'bomWorkspace' ? 'bomWorkspace' : materialSection === 'bomUsage' ? 'bomUsage' : 'materialManagement'
    : tab === 'create' || tab === 'detail'
      ? 'orders'
      : workspaceFunctionCatalog.find((item) => item.tab === tab)?.key || 'dashboard'
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
  const activeFunctionPath = `${activeGroupLabel} / ${activeTabLabel}`

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
  const openWorkspaceFunction = (functionKey: WorkspaceFunctionKey) => {
    const target = workspaceFunctionItems.find((item) => item.key === functionKey)
    if (!target) return
    if (target.materialSection) setMaterialSection(target.materialSection)
    setTab(target.tab)
    closeNavigationSurfaces()
    recordWorkspaceUsage(functionKey)
  }
  const navigateToTab = (nextTab: TabType, nextMaterialSection?: MaterialSection) => {
    if (nextTab === 'allFunctions') {
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
  const changeWorkspace = (nextWorkspace: NavigationWorkspaceId) => {
    if (nextWorkspace === activeWorkspace) return
    setActiveWorkspace(nextWorkspace)
    setMobileNavOpen(false)
    closeTransientNavigation()
    if (!workspaceContainsFunction(workspaceNavigationConfig, nextWorkspace, activeFunctionKey)) {
      setTab('dashboard')
    }
  }

  const navigationGroups: NavigationGroup[] = visibleBusinessGroups.map((group) => {
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
    navigationGroups.push({
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
  navigationGroups.sort((left, right) => (
    Number(configuredGroupOrder.get(left.id as BusinessNavGroupKey) ?? 10000)
    - Number(configuredGroupOrder.get(right.id as BusinessNavGroupKey) ?? 10000)
  ))
  const activeNavigationGroup = navigationGroups.find((group) => group.active)
  const navigationItemByShortcutKey = new Map<string, NavigationItem>()
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (item.shortcutKey && !navigationItemByShortcutKey.has(item.shortcutKey)) {
        navigationItemByShortcutKey.set(item.shortcutKey, item)
      }
    }
  }
  const mobilePrimaryItems = navItems.slice(0, 4).map((favorite) => {
    const navigationItem = navigationItemByShortcutKey.get(favorite.key)
    return {
      key: favorite.key,
      label: navigationItem?.label || favorite.label,
      active: navigationItem?.active ?? tab === favorite.key,
      onClick: navigationItem?.onClick || (() => navigateToTab(favorite.key)),
    }
  })

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    workspaceNavigationConfig,
    activeWorkspace,
    workspaceFunctionItems,
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
    changeWorkspace,
  }
}
