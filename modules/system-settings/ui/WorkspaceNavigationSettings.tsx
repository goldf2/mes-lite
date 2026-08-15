'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { businessNavGroups, workspaceFunctionCatalog } from '@/app/app-navigation'
import {
  configurableWorkspaceFunctionKeys,
  createDefaultWorkspaceNavigationConfig,
  sharedWorkspaceFunctionKeys,
  navigationWorkspaceIds,
  navigationWorkspaceLabels,
  type NavigationWorkspaceId,
  type WorkspaceNavigationGroupKey,
  type WorkspaceNavigationConfig,
} from '@/lib/workspace-navigation-config'
import type { WorkspaceFunctionKey } from '@/lib/workspace'
import {
  announceWorkspaceNavigationConfig,
  loadWorkspaceNavigationConfig,
  saveWorkspaceNavigationConfig,
} from '@/modules/workspace'

const catalogItems = workspaceFunctionCatalog.filter((item) => configurableWorkspaceFunctionKeys.includes(item.key))
const catalogByKey = new Map(catalogItems.map((item) => [item.key, item]))
const sharedFunctionKeySet = new Set<WorkspaceFunctionKey>(sharedWorkspaceFunctionKeys)
const sharedCatalogItems = workspaceFunctionCatalog.filter((item) => sharedFunctionKeySet.has(item.key))
const groupOrder = new Map<string, number>(businessNavGroups.map((group, index) => [group.key, index]))
const businessGroupByKey = new Map(businessNavGroups.map((group) => [group.key, group]))
businessGroupByKey.set('account', { key: 'account', label: '账号与权限', tabs: [] })

function cloneConfig(config: WorkspaceNavigationConfig): WorkspaceNavigationConfig {
  return JSON.parse(JSON.stringify(config)) as WorkspaceNavigationConfig
}

function duplicateLabel(config: WorkspaceNavigationConfig) {
  const seen = new Map<string, WorkspaceFunctionKey>()
  for (const item of config.workspaces.mes.items) {
    const catalog = catalogByKey.get(item.functionKey)
    if (!catalog) continue
    const identity = `${catalog.groupKey}:${(item.label || catalog.label).trim().toLocaleLowerCase('zh-CN')}`
    const existing = seen.get(identity)
    if (existing && existing !== item.functionKey) {
      return `“${item.label || catalog.label}”与同一功能区内的其他页面重名`
    }
    seen.set(identity, item.functionKey)
  }
  return null
}

export default function WorkspaceNavigationSettings({ onMessage, canUpdate }: { onMessage: (message: string) => void; canUpdate: boolean }) {
  const [draft, setDraft] = useState<WorkspaceNavigationConfig>(createDefaultWorkspaceNavigationConfig)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDraft(cloneConfig(await loadWorkspaceNavigationConfig()))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取导航菜单配置失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    void load()
  }, [load])

  const activeItems = draft.workspaces.mes.items
  const activeGroupSet = new Set<WorkspaceNavigationGroupKey>(
    [...activeItems.map((item) => item.functionKey), ...sharedWorkspaceFunctionKeys]
      .map((functionKey) => workspaceFunctionCatalog.find((item) => item.key === functionKey)?.groupKey)
      .filter((groupKey): groupKey is WorkspaceNavigationGroupKey => (
        Boolean(groupKey) && businessGroupByKey.has(groupKey as WorkspaceNavigationGroupKey)
      )),
  )
  const activeGroupKeys = draft.workspaces.mes.groupOrder.filter((groupKey) => activeGroupSet.has(groupKey))
  const orderedCatalog = useMemo(() => {
    const activeOrder = new Map(activeItems.map((item, index) => [item.functionKey, index]))
    return [...catalogItems].sort((left, right) => {
      const itemDiff = Number(activeOrder.get(left.key) ?? 999) - Number(activeOrder.get(right.key) ?? 999)
      const groupDiff = Number(groupOrder.get(left.groupKey) ?? 999) - Number(groupOrder.get(right.groupKey) ?? 999)
      return itemDiff || groupDiff || left.label.localeCompare(right.label, 'zh-CN')
    })
  }, [activeItems])
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleCatalog = normalizedQuery
    ? orderedCatalog.filter((item) => `${item.key} ${item.label} ${item.groupLabel}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    : orderedCatalog

  const updateMesNavigation = (update: (current: WorkspaceNavigationConfig['workspaces']['mes']) => void) => {
    setDraft((current) => {
      const next = cloneConfig(current)
      update(next.workspaces.mes)
      return next
    })
  }

  const updateModuleButton = (
    moduleId: NavigationWorkspaceId,
    update: (current: WorkspaceNavigationConfig['moduleButtons'][NavigationWorkspaceId]) => void,
  ) => {
    setDraft((current) => {
      const next = cloneConfig(current)
      update(next.moduleButtons[moduleId])
      return next
    })
  }

  const renameItem = (functionKey: WorkspaceFunctionKey, label: string) => {
    updateMesNavigation((workspace) => {
      workspace.items = workspace.items.map((item) => item.functionKey === functionKey
        ? { ...item, label: label.slice(0, 20) || undefined }
        : item)
    })
  }

  const moveItem = (functionKey: WorkspaceFunctionKey, direction: -1 | 1) => {
    updateMesNavigation((workspace) => {
      const index = workspace.items.findIndex((item) => item.functionKey === functionKey)
      const target = index + direction
      if (index < 0 || target < 0 || target >= workspace.items.length) return
      const [item] = workspace.items.splice(index, 1)
      workspace.items.splice(target, 0, item)
    })
  }

  const moveGroup = (groupKey: WorkspaceNavigationGroupKey, direction: -1 | 1) => {
    updateMesNavigation((workspace) => {
      const visibleKeys = workspace.groupOrder.filter((candidate) => activeGroupSet.has(candidate))
      const index = visibleKeys.indexOf(groupKey)
      const targetKey = visibleKeys[index + direction]
      if (index < 0 || !targetKey) return
      const currentPosition = workspace.groupOrder.indexOf(groupKey)
      const targetPosition = workspace.groupOrder.indexOf(targetKey)
      workspace.groupOrder[currentPosition] = targetKey
      workspace.groupOrder[targetPosition] = groupKey
    })
  }

  const save = async () => {
    const duplicate = duplicateLabel(draft)
    if (duplicate) return onMessage(duplicate)
    setSaving(true)
    try {
      const saved = cloneConfig(await saveWorkspaceNavigationConfig(draft))
      setDraft(saved)
      for (const key of ['mes-lite.nav.order', 'mes-lite.nav.order.mes', 'mes-lite.nav.order.mrp', 'mes-lite.nav.order.erp', 'mes-lite.navigation.activeWorkspace']) {
        window.localStorage.removeItem(key)
      }
      announceWorkspaceNavigationConfig(saved)
      onMessage('导航菜单配置已发布')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存导航菜单配置失败')
    } finally {
      setSaving(false)
    }
  }

  const restoreDefault = () => {
    setDraft(createDefaultWorkspaceNavigationConfig())
    onMessage('已恢复系统默认草稿，点击“保存并发布”后生效')
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <div className="font-medium text-gray-900">统一 MES 工作台</div>
        <div className="mt-1 text-sm text-gray-600">MES 是产品主定位；计划、销售、客户和供应商能力作为同一制造业务链的功能区呈现。顶部模块按钮只用于品牌与未来能力预留，不切换菜单、权限或业务数据。</div>
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="font-medium text-gray-900">顶部模块按钮</div>
        <div className="mt-1 text-sm text-gray-500">MES-lite 是当前主模块并始终显示；MRP、ERP 可改名或隐藏，显示时仍为不可点击的预留入口。</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {navigationWorkspaceIds.map((moduleId) => {
            const button = draft.moduleButtons[moduleId]
            const active = moduleId === 'mes'
            return (
              <div key={moduleId} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-gray-800">{navigationWorkspaceLabels[moduleId]}</div>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={button.visible}
                      disabled={!canUpdate || active}
                      onChange={(event) => updateModuleButton(moduleId, (current) => { current.visible = event.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {active ? '主模块' : '显示'}
                  </label>
                </div>
                <label className="mt-3 block text-xs text-gray-500">
                  按钮名称
                  <input
                    value={button.label}
                    disabled={!canUpdate}
                    maxLength={20}
                    onChange={(event) => updateModuleButton(moduleId, (current) => { current.label = event.target.value.slice(0, 20) })}
                    placeholder={navigationWorkspaceLabels[moduleId]}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                  />
                </label>
                {!active && <div className="mt-2 text-[11px] text-amber-700">仅预留展示，不启用独立工作区</div>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-gray-800">一级菜单顺序</div>
              <div className="mt-1 text-xs text-gray-500">顺序同时应用于桌面侧栏、顶部导航和移动端菜单。</div>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面、内部名称或功能区" className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:max-w-sm" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeGroupKeys.map((groupKey, index) => (
              <div key={groupKey} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 pl-2.5">
                <span className="mr-1 text-sm font-medium text-gray-700">{index + 1}. {businessGroupByKey.get(groupKey)?.label || groupKey}</span>
                <button type="button" disabled={!canUpdate || index === 0} onClick={() => moveGroup(groupKey, -1)} aria-label={`前移${businessGroupByKey.get(groupKey)?.label || groupKey}`} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30">前移</button>
                <button type="button" disabled={!canUpdate || index === activeGroupKeys.length - 1} onClick={() => moveGroup(groupKey, 1)} aria-label={`后移${businessGroupByKey.get(groupKey)?.label || groupKey}`} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30">后移</button>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500">显示名称留空时使用系统名称。调整名称和顺序不会改变内部页面 ID、路由、权限和业务数据。</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-white text-left text-xs text-gray-500">
              <tr><th className="px-4 py-3">系统页面</th><th className="px-4 py-3">显示名称</th><th className="px-4 py-3">功能区</th><th className="px-4 py-3 text-right">顺序</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleCatalog.map((catalog) => {
                const itemIndex = activeItems.findIndex((item) => item.functionKey === catalog.key)
                const item = itemIndex >= 0 ? activeItems[itemIndex] : undefined
                return (
                  <tr key={catalog.key} className="bg-white">
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{catalog.label}</div><div className="font-mono text-[11px] text-gray-400">{catalog.key}</div></td>
                    <td className="px-4 py-3"><input disabled={!canUpdate} value={item?.label || ''} onChange={(event) => renameItem(catalog.key, event.target.value)} maxLength={20} placeholder={catalog.label} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100" /></td>
                    <td className="px-4 py-3 text-gray-500">{catalog.groupLabel}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" disabled={!canUpdate || itemIndex <= 0} onClick={() => moveItem(catalog.key, -1)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30">上移</button><button type="button" disabled={!canUpdate || itemIndex < 0 || itemIndex >= activeItems.length - 1} onClick={() => moveItem(catalog.key, 1)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30">下移</button></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="font-medium text-gray-900">固定系统功能</div>
        <div className="mt-1 text-sm text-gray-500">以下能力始终保留，防止配置、权限和维护入口被意外隐藏。</div>
        <div className="mt-3 flex flex-wrap gap-2">{sharedCatalogItems.map((item) => <span key={item.key} className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600">{item.label}</span>)}</div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {canUpdate && <AppButton variant="secondary" onClick={restoreDefault} disabled={loading || saving}>恢复系统默认</AppButton>}
        {canUpdate && <AppButton variant="primary" onClick={save} disabled={loading || saving}>{saving ? '发布中...' : '保存并发布'}</AppButton>}
      </div>
    </div>
  )
}
