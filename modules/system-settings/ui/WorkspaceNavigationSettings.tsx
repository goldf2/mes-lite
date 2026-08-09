'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import { businessNavGroups, workspaceFunctionCatalog } from '@/app/app-navigation'
import {
  configurableWorkspaceFunctionKeys,
  createDefaultWorkspaceNavigationConfig,
  enabledNavigationWorkspaces,
  navigationWorkspaceIds,
  navigationWorkspaceLabels,
  sharedWorkspaceFunctionKeys,
  workspaceOwnerOfFunction,
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
import WorkspaceDomainTabs from '@/app/components/navigation/WorkspaceDomainTabs'

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
  for (const workspace of navigationWorkspaceIds) {
    const seen = new Map<string, WorkspaceFunctionKey>()
    for (const item of config.workspaces[workspace].items) {
      const catalog = catalogByKey.get(item.functionKey)
      if (!catalog) continue
      const identity = `${catalog.groupKey}:${(item.label || catalog.label).trim().toLocaleLowerCase('zh-CN')}`
      const existing = seen.get(identity)
      if (existing && existing !== item.functionKey) {
        return `${navigationWorkspaceLabels[workspace]} 的“${item.label || catalog.label}”与同级菜单重名`
      }
      seen.set(identity, item.functionKey)
    }
  }
  return null
}

export default function WorkspaceNavigationSettings({ onMessage }: { onMessage: (message: string) => void }) {
  const [draft, setDraft] = useState<WorkspaceNavigationConfig>(createDefaultWorkspaceNavigationConfig)
  const [selectedWorkspace, setSelectedWorkspace] = useState<NavigationWorkspaceId>('mes')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadWorkspaceNavigationConfig()
      setDraft(cloneConfig(data))
      setSelectedWorkspace((current) => data.workspaces[current]?.enabled ? current : data.defaultWorkspace)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取工作区菜单配置失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    void load()
  }, [load])

  const activeItems = draft.workspaces[selectedWorkspace].items
  const activeGroupSet = new Set<WorkspaceNavigationGroupKey>(
    [...activeItems.map((item) => item.functionKey), ...sharedWorkspaceFunctionKeys]
      .map((functionKey) => workspaceFunctionCatalog.find((item) => item.key === functionKey)?.groupKey)
      .filter((groupKey): groupKey is WorkspaceNavigationGroupKey => (
        Boolean(groupKey) && businessGroupByKey.has(groupKey as WorkspaceNavigationGroupKey)
      )),
  )
  const activeGroupKeys = draft.workspaces[selectedWorkspace].groupOrder.filter((groupKey) => activeGroupSet.has(groupKey))
  const orderedCatalog = useMemo(() => {
    const activeOrder = new Map(activeItems.map((item, index) => [item.functionKey, index]))
    return [...catalogItems].sort((left, right) => {
      const leftAssigned = activeOrder.has(left.key)
      const rightAssigned = activeOrder.has(right.key)
      if (leftAssigned !== rightAssigned) return leftAssigned ? -1 : 1
      if (leftAssigned && rightAssigned) return Number(activeOrder.get(left.key)) - Number(activeOrder.get(right.key))
      const groupDiff = Number(groupOrder.get(left.groupKey) ?? 999) - Number(groupOrder.get(right.groupKey) ?? 999)
      return groupDiff || left.label.localeCompare(right.label, 'zh-CN')
    })
  }, [activeItems])
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleCatalog = normalizedQuery
    ? orderedCatalog.filter((item) => `${item.key} ${item.label} ${item.groupLabel}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    : orderedCatalog

  const updateWorkspace = (workspace: NavigationWorkspaceId, update: (current: WorkspaceNavigationConfig['workspaces'][NavigationWorkspaceId]) => void) => {
    setDraft((current) => {
      const next = cloneConfig(current)
      update(next.workspaces[workspace])
      return next
    })
  }

  const toggleWorkspace = (workspace: NavigationWorkspaceId, enabled: boolean) => {
    setDraft((current) => {
      if (!enabled && enabledNavigationWorkspaces(current).length === 1) {
        onMessage('至少需要启用一个业务工作区')
        return current
      }
      const next = cloneConfig(current)
      next.workspaces[workspace].enabled = enabled
      if (!next.workspaces[next.defaultWorkspace].enabled) {
        next.defaultWorkspace = enabledNavigationWorkspaces(next)[0]
      }
      return next
    })
    if (!enabled && selectedWorkspace === workspace) {
      const fallback = navigationWorkspaceIds.find((candidate) => candidate !== workspace && draft.workspaces[candidate].enabled)
      if (fallback) setSelectedWorkspace(fallback)
    }
  }

  const assignWorkspace = (functionKey: WorkspaceFunctionKey, owner: NavigationWorkspaceId) => {
    setDraft((current) => {
      const next = cloneConfig(current)
      const existing = navigationWorkspaceIds
        .flatMap((workspace) => next.workspaces[workspace].items)
        .find((item) => item.functionKey === functionKey)
      for (const workspace of navigationWorkspaceIds) {
        next.workspaces[workspace].items = next.workspaces[workspace].items.filter((item) => item.functionKey !== functionKey)
      }
      next.workspaces[owner].items.push(existing?.label ? { functionKey, label: existing.label } : { functionKey })
      return next
    })
  }

  const renameItem = (functionKey: WorkspaceFunctionKey, label: string) => {
    updateWorkspace(selectedWorkspace, (workspace) => {
      workspace.items = workspace.items.map((item) => item.functionKey === functionKey
        ? { ...item, label: label.slice(0, 20) || undefined }
        : item)
    })
  }

  const moveItem = (functionKey: WorkspaceFunctionKey, direction: -1 | 1) => {
    updateWorkspace(selectedWorkspace, (workspace) => {
      const index = workspace.items.findIndex((item) => item.functionKey === functionKey)
      const target = index + direction
      if (index < 0 || target < 0 || target >= workspace.items.length) return
      const [item] = workspace.items.splice(index, 1)
      workspace.items.splice(target, 0, item)
    })
  }

  const moveGroup = (groupKey: WorkspaceNavigationGroupKey, direction: -1 | 1) => {
    updateWorkspace(selectedWorkspace, (workspace) => {
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
      for (const workspace of navigationWorkspaceIds) {
        window.localStorage.removeItem(`mes-lite.nav.order.${workspace}`)
      }
      announceWorkspaceNavigationConfig(saved)
      onMessage('工作区菜单配置已发布')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存工作区菜单配置失败')
    } finally {
      setSaving(false)
    }
  }

  const restoreDefault = () => {
    const defaults = createDefaultWorkspaceNavigationConfig()
    setDraft(defaults)
    setSelectedWorkspace(defaults.defaultWorkspace)
    onMessage('已恢复系统默认草稿，点击“保存并发布”后生效')
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-medium text-gray-900">业务工作区</div>
            <div className="mt-1 text-sm text-gray-500">控制 MES、MRP、ERP 是否启用及默认进入的工作区；只改变菜单视角，不复制页面或数据。</div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            默认工作区
            <select
              value={draft.defaultWorkspace}
              onChange={(event) => setDraft((current) => ({ ...current, defaultWorkspace: event.target.value as NavigationWorkspaceId }))}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800"
            >
              {enabledNavigationWorkspaces(draft).map((workspace) => <option key={workspace} value={workspace}>{navigationWorkspaceLabels[workspace]}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {navigationWorkspaceIds.map((workspace) => (
            <label key={workspace} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${draft.workspaces[workspace].enabled ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50'}`}>
              <span className="font-semibold text-gray-900">{navigationWorkspaceLabels[workspace]}</span>
              <input type="checkbox" checked={draft.workspaces[workspace].enabled} onChange={(event) => toggleWorkspace(workspace, event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            </label>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full max-w-xs"><WorkspaceDomainTabs config={draft} value={selectedWorkspace} onChange={setSelectedWorkspace} /></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索系统名称、内部页面或分组" className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:max-w-sm" />
          </div>
          <div className="mt-2 text-xs text-gray-500">每个业务页面只能属于一个工作区；显示名称留空时使用系统名称。调整归属或名称不会改变内部页面 ID、路由、权限和业务数据。</div>
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="text-sm font-medium text-gray-800">一级菜单顺序</div>
            <div className="mt-1 text-xs text-gray-500">顺序同时应用于桌面侧栏、顶部导航和移动端菜单。</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeGroupKeys.map((groupKey, index) => (
                <div key={groupKey} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 pl-2.5">
                  <span className="mr-1 text-sm font-medium text-gray-700">{index + 1}. {businessGroupByKey.get(groupKey)?.label || groupKey}</span>
                  <button type="button" disabled={index === 0} onClick={() => moveGroup(groupKey, -1)} aria-label={`前移${businessGroupByKey.get(groupKey)?.label || groupKey}`} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30">前移</button>
                  <button type="button" disabled={index === activeGroupKeys.length - 1} onClick={() => moveGroup(groupKey, 1)} aria-label={`后移${businessGroupByKey.get(groupKey)?.label || groupKey}`} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30">后移</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white text-left text-xs text-gray-500">
              <tr><th className="px-4 py-3">所属工作区</th><th className="px-4 py-3">系统页面</th><th className="px-4 py-3">显示名称</th><th className="px-4 py-3">分组</th><th className="px-4 py-3 text-right">顺序</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleCatalog.map((catalog) => {
                const owner = workspaceOwnerOfFunction(draft, catalog.key) || 'mes'
                const assigned = owner === selectedWorkspace
                const itemIndex = activeItems.findIndex((item) => item.functionKey === catalog.key)
                const item = itemIndex >= 0 ? activeItems[itemIndex] : undefined
                return (
                  <tr key={catalog.key} className={assigned ? 'bg-white' : 'bg-gray-50/60 text-gray-400'}>
                    <td className="px-4 py-3">
                      <select value={owner} onChange={(event) => assignWorkspace(catalog.key, event.target.value as NavigationWorkspaceId)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                        {navigationWorkspaceIds.map((workspace) => <option key={workspace} value={workspace}>{navigationWorkspaceLabels[workspace]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{catalog.label}</div><div className="font-mono text-[11px] text-gray-400">{catalog.key}</div></td>
                    <td className="px-4 py-3"><input disabled={!assigned} value={item?.label || ''} onChange={(event) => renameItem(catalog.key, event.target.value)} maxLength={20} placeholder={catalog.label} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100" /></td>
                    <td className="px-4 py-3 text-gray-500">{catalog.groupLabel}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" disabled={!assigned || itemIndex <= 0} onClick={() => moveItem(catalog.key, -1)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30">上移</button><button type="button" disabled={!assigned || itemIndex < 0 || itemIndex >= activeItems.length - 1} onClick={() => moveItem(catalog.key, 1)} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30">下移</button></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="font-medium text-gray-900">固定共享功能</div>
        <div className="mt-1 text-sm text-gray-500">以下系统能力始终出现在已启用工作区，防止配置、权限和维护入口被意外隐藏。</div>
        <div className="mt-3 flex flex-wrap gap-2">{sharedCatalogItems.map((item) => <span key={item.key} className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600">{item.label}</span>)}</div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <AppButton variant="secondary" onClick={restoreDefault} disabled={loading || saving}>恢复系统默认</AppButton>
        <AppButton variant="primary" onClick={save} disabled={loading || saving}>{saving ? '发布中...' : '保存并发布'}</AppButton>
      </div>
    </div>
  )
}
