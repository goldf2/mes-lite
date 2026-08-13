'use client'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { OneToManyRelationField, RelationSearch } from '@/app/components/relations'
import { filterByAdvancedSearch, matchesKeywordValues } from '@/lib/resource-search'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'
import {
  createPermissionGroup,
  loadPermissionAdministration,
  savePermissionAdministration,
} from '../client/identity-access-api'
import type {
  OperatorPermissionGroup,
  OperatorPermissionOverrideSetting,
  OperatorDataScopeSetting,
  PermissionActionItem,
  PermissionFlags,
  PermissionGroup,
  PermissionGroupSetting,
  PermissionOperator,
  PermissionResourceItem,
  PermissionScopeOption,
} from '../contracts/permission-admin'

const actionHelp: Record<string, string> = {
  canRead: '查看页面和列表',
  canCreate: '新增单据或资料',
  canUpdate: '编辑、确认、审核、状态流转',
  canDelete: '归档或移除记录',
  canGrant: '授权本模块权限',
}

const roleLabels: Record<string, string> = {
  OPERATOR: '录入',
  AUDITOR: '审核',
  ADMIN: '管理',
}

const statusLabels: Record<string, string> = {
  PENDING: '待审核',
  ACTIVE: '已启用',
  REJECTED: '已拒绝',
  DISABLED: '已停用',
}

const operatorAdvancedSearchFields: readonly ResourceAdvancedSearchField<PermissionOperator>[] = [
  { key: 'username', label: '登录账号', type: 'text', read: (item) => item.username },
  { key: 'name', label: '姓名', type: 'text', read: (item) => item.name },
  { key: 'role', label: '系统角色', type: 'select', read: (item) => item.role, options: Object.entries(roleLabels).map(([value, label]) => ({ value, label })) },
  { key: 'status', label: '账号状态', type: 'select', read: (item) => item.status, options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })) },
]

const blankFlags: PermissionFlags = {
  canRead: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  canGrant: false,
}

export default function PermissionPageModule({
  mode = 'users',
  onMessage,
}: {
  mode?: 'users' | 'groups'
  onMessage: (msg: string) => void
}) {
  const [resources, setResources] = useState<PermissionResourceItem[]>([])
  const [actions, setActions] = useState<PermissionActionItem[]>([])
  const [operators, setOperators] = useState<PermissionOperator[]>([])
  const [groups, setGroups] = useState<PermissionGroup[]>([])
  const [operatorGroups, setOperatorGroups] = useState<OperatorPermissionGroup[]>([])
  const [operatorPermissionOverrides, setOperatorPermissionOverrides] = useState<OperatorPermissionOverrideSetting[]>([])
  const [operatorDataScopes, setOperatorDataScopes] = useState<OperatorDataScopeSetting[]>([])
  const [workCenters, setWorkCenters] = useState<PermissionScopeOption[]>([])
  const [locations, setLocations] = useState<PermissionScopeOption[]>([])
  const [activeGroupId, setActiveGroupId] = useState('')
  const [activeOperatorId, setActiveOperatorId] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchConditions, setSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [newGroup, setNewGroup] = useState({ name: '', code: '', description: '' })
  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [temporaryGrant, setTemporaryGrant] = useState({
    resource: '', canRead: true, canCreate: false, canUpdate: false, canDelete: false, canGrant: false,
    reason: '', startsAt: '', expiresAt: '',
  })
  const [loading, setLoading] = useState(false)
  const [userViewMode, setUserViewMode] = usePersistedViewMode('mes-lite.permissions.users.viewMode', 'card')
  const [groupViewMode, setGroupViewMode] = usePersistedViewMode('mes-lite.permissions.groups.viewMode', 'list')

  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadPermissionAdministration()
      const fetchedGroups = data.groups || []
      setResources(data.resources || [])
      setActions(data.actions || [])
      setOperators(data.operators || [])
      setGroups(fetchedGroups)
      setOperatorGroups(data.operatorGroups || [])
      setOperatorPermissionOverrides(data.operatorPermissionOverrides || [])
      setOperatorDataScopes(data.operatorDataScopes || [])
      setWorkCenters(data.workCenters || [])
      setLocations(data.locations || [])
      setActiveGroupId((current) => current || fetchedGroups[0]?.id || '')
      setActiveOperatorId((current) => current || data.operators?.[0]?.id || '')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取权限失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    void fetchPermissions()
  }, [fetchPermissions])

  const activeGroup = groups.find((group) => group.id === activeGroupId)
  const activeOperator = operators.find((operator) => operator.id === activeOperatorId)
  const activeDataScope = operatorDataScopes.find((scope) => scope.operatorId === activeOperatorId)
  const activePermissionOverrides = operatorPermissionOverrides.filter((item) => item.operatorId === activeOperatorId)
  const groupMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    operatorGroups.forEach((item) => {
      counts[item.groupId] = (counts[item.groupId] || 0) + 1
    })
    return counts
  }, [operatorGroups])
  const groupSort = useClientTableSort(groups, {
    name: (group) => group.name,
    code: (group) => group.code,
    description: (group) => group.description,
    memberCount: (group) => groupMemberCounts[group.id] || 0,
  }, 'name', 'asc')
  const filteredOperators = useMemo(() => {
    const advancedOperators = filterByAdvancedSearch(operators, operatorAdvancedSearchFields, searchConditions)
    if (!searchKeyword.trim()) return advancedOperators

    return advancedOperators.filter((operator) => matchesKeywordValues(searchKeyword, [
      operator.name,
      operator.username,
      roleLabels[operator.role] || operator.role,
    ]))
  }, [operators, searchConditions, searchKeyword])

  const isAssigned = (operatorId: string, groupId: string) => {
    return operatorGroups.some((item) => item.operatorId === operatorId && item.groupId === groupId)
  }

  const toggleOperatorGroup = (groupId: string) => {
    if (!activeOperator || activeOperator.role === 'ADMIN') return
    setActiveGroupId(groupId)

    setOperatorGroups((prev) => {
      if (prev.some((item) => item.operatorId === activeOperator.id && item.groupId === groupId)) {
        return prev.filter((item) => !(item.operatorId === activeOperator.id && item.groupId === groupId))
      }
      return [...prev, { operatorId: activeOperator.id, groupId }]
    })
  }

  const updateActiveDataScope = (patch: Partial<OperatorDataScopeSetting>) => {
    if (!activeOperator || activeOperator.role === 'ADMIN') return
    setOperatorDataScopes((current) => current.map((scope) => scope.operatorId === activeOperator.id
      ? { ...scope, ...patch, inheritedLegacyDefault: false }
      : scope))
  }

  const selectedWorkCenters = workCenters.filter((item) => activeDataScope?.workCenterIds.includes(item.id))
  const selectedLocations = locations.filter((item) => activeDataScope?.locationIds.includes(item.id))

  const groupSettingMap = useMemo(() => {
    const map = new Map<string, PermissionGroupSetting>()
    activeGroup?.settings.forEach((setting) => map.set(setting.resource, setting))
    return map
  }, [activeGroup])

  const currentGroupSettings = resources.map((resource) => {
    return groupSettingMap.get(resource.key) || {
      groupId: activeGroupId,
      resource: resource.key,
      ...blankFlags,
    }
  })
  const groupedSettings = useMemo(() => {
    const groups = new Map<string, typeof currentGroupSettings>()
    for (const setting of currentGroupSettings) {
      const section = resources.find((resource) => resource.key === setting.resource)?.section || '其他'
      groups.set(section, [...(groups.get(section) || []), setting])
    }
    return Array.from(groups.entries())
  }, [currentGroupSettings, resources])

  const toggleGroupSetting = (resource: string, action: keyof PermissionFlags) => {
    if (!activeGroup) return

    setGroups((prev) => prev.map((group) => {
      if (group.id !== activeGroup.id) return group

      const existing = group.settings.find((setting) => setting.resource === resource)
      if (existing) {
        return {
          ...group,
          settings: group.settings.map((setting) =>
            setting.resource === resource ? { ...setting, [action]: !setting[action] } : setting
          ),
        }
      }

      return {
        ...group,
        settings: [
          ...group.settings,
          {
            groupId: group.id,
            resource,
            ...blankFlags,
            [action]: true,
          },
        ],
      }
    }))
  }

  const saveAssignment = async () => {
    if (!activeOperator) return

    setLoading(true)
    const selectedAssignment = {
      operatorId: activeOperator.id,
      groupIds: operatorGroups
        .filter((item) => item.operatorId === activeOperator.id)
        .map((item) => item.groupId),
    }

    try {
      const data = await savePermissionAdministration({
        operatorGroups: [selectedAssignment],
        operatorDataScopes: activeDataScope && activeOperator.role !== 'ADMIN' ? [{
          operatorId: activeDataScope.operatorId,
          productionMode: activeDataScope.productionMode,
          inventoryMode: activeDataScope.inventoryMode,
          workCenterIds: activeDataScope.workCenterIds,
          locationIds: activeDataScope.locationIds,
        }] : undefined,
      })
      onMessage(data.message || '权限组分配已保存')
      await fetchPermissions()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存权限组分配失败')
    } finally {
      setLoading(false)
    }
  }

  const saveGroupSettings = async () => {
    if (!activeGroup) return

    setLoading(true)
    try {
      const data = await savePermissionAdministration({
        groupId: activeGroup.id,
        groupSettings: activeGroup.settings.map(({ id, groupId, ...setting }) => setting),
      })
      onMessage(data.message || '权限组明细已保存')
      await fetchPermissions()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存权限组明细失败')
    } finally {
      setLoading(false)
    }
  }

  const saveTemporaryGrant = async () => {
    if (!activeOperator || !temporaryGrant.resource || !temporaryGrant.reason.trim()
      || !temporaryGrant.startsAt || !temporaryGrant.expiresAt) {
      onMessage('临时授权必须选择功能并填写原因、开始和失效时间')
      return
    }
    setLoading(true)
    try {
      const data = await savePermissionAdministration({
        operatorPermissionOverrides: [{
          action: 'UPSERT', operatorId: activeOperator.id,
          ...temporaryGrant,
          startsAt: new Date(temporaryGrant.startsAt).toISOString(),
          expiresAt: new Date(temporaryGrant.expiresAt).toISOString(),
        }],
      })
      onMessage(data.message || '个人临时授权已保存')
      setTemporaryGrant((current) => ({ ...current, reason: '', startsAt: '', expiresAt: '' }))
      await fetchPermissions()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存个人临时授权失败')
    } finally {
      setLoading(false)
    }
  }

  const removeTemporaryGrant = async (item: OperatorPermissionOverrideSetting) => {
    setLoading(true)
    try {
      await savePermissionAdministration({ operatorPermissionOverrides: [{
        action: 'DELETE', operatorId: item.operatorId, resource: item.resource,
      }] })
      onMessage('个人例外权限已移除')
      await fetchPermissions()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '移除个人例外权限失败')
    } finally {
      setLoading(false)
    }
  }

  const createGroup = async () => {
    if (!newGroup.name.trim()) return

    setLoading(true)
    try {
      const data = await createPermissionGroup(newGroup)
      onMessage(data.message || '权限组已创建')
      setNewGroup({ name: '', code: '', description: '' })
      setShowNewGroupForm(false)
      await fetchPermissions()
      if (data.data?.id) setActiveGroupId(data.data.id)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '创建权限组失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <TopBarPortal>
        {mode === 'users' ? (
          <ResponsiveToolbarActions
            primaryFilters={(
              <SearchFieldWithPresets
                storageKey="mes-lite.searchPresets.permissionUsers"
                value={searchKeyword}
                onChange={setSearchKeyword}
                placeholder="搜索账号、姓名或角色"
                conditions={searchConditions}
                onConditionsChange={setSearchConditions}
                conditionLabel="人员权限精确搜索"
              />
            )}
            advancedSearch={<ResourceAdvancedSearch fields={operatorAdvancedSearchFields} conditions={searchConditions} onChange={setSearchConditions} />}
            viewControl={<ViewModeToggle value={userViewMode} onChange={setUserViewMode} />}
            actions={(
              <>
                <AppButton variant="primary" onClick={saveAssignment} disabled={loading || !activeOperator || activeOperator.role === 'ADMIN'}>
                  {loading ? '保存中...' : '保存当前人员'}
                </AppButton>
              </>
            )}
          />
        ) : (
          <ResponsiveToolbarActions
            viewControl={<ViewModeToggle value={groupViewMode} onChange={setGroupViewMode} />}
            actions={(
              <>
                <AppButton variant="create" onClick={() => setShowNewGroupForm((value) => !value)} disabled={loading}>新建权限组</AppButton>
                <AppButton variant="primary" onClick={saveGroupSettings} disabled={loading || !activeGroup}>保存权限组赋权</AppButton>
              </>
            )}
          />
        )}
      </TopBarPortal>
      {mode === 'users' && <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">人员赋权</h2>
            <p className="text-sm text-gray-500 mt-1">选择人员后勾选权限组。人员可加入多个权限组，最终权限按权限组合并。</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <div className="px-4 py-3 bg-gray-900 text-white text-sm font-medium">人员列表 ({operators.length})</div>
            <div className="max-h-[480px] overflow-y-auto">
              {filteredOperators.map((operator) => (
                <button
                  key={operator.id}
                  onClick={() => setActiveOperatorId(operator.id)}
                  className={`w-full text-left px-4 py-3 border-l-4 transition ${
                    activeOperatorId === operator.id
                      ? 'bg-blue-50 border-blue-600'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-600 text-white flex items-center justify-center text-sm font-semibold">
                      {(operator.name || operator.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{operator.name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {operator.username} · {roleLabels[operator.role] || operator.role}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {filteredOperators.length === 0 && (
                <div className="px-4 py-8 text-sm text-gray-500 text-center">没有匹配人员</div>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white min-h-[480px] flex flex-col">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {activeOperator ? activeOperator.name : '选择一个人员'}
                  {activeOperator && <span className="ml-2 text-sm font-normal text-blue-700">{activeOperator.username}</span>}
                </div>
                {activeOperator && (
                  <div className="mt-1 text-xs text-gray-500">
                    {roleLabels[activeOperator.role] || activeOperator.role} · {statusLabels[activeOperator.status] || activeOperator.status}
                  </div>
                )}
              </div>
              {activeOperator?.role === 'ADMIN' && (
                <span className="px-2 py-1 rounded bg-yellow-50 text-yellow-700 text-xs">管理账号固定全权限</span>
              )}
            </div>

            <div className="p-5 flex-1">
              {activeOperator ? (
                userViewMode === 'card' ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {groupSort.sortedRows.map((group) => {
                      const checked = activeOperator.role === 'ADMIN' || isAssigned(activeOperator.id, group.id)
                      return (
                        <label
                          key={group.id}
                          className={`border rounded-lg p-4 cursor-pointer transition ${
                            checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                          } ${activeGroupId === group.id ? 'ring-2 ring-blue-200' : ''}`}
                          onClick={() => setActiveGroupId(group.id)}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={loading || activeOperator.role === 'ADMIN'}
                              onChange={() => toggleOperatorGroup(group.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 rounded border-gray-300"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-sm">{group.name}</div>
                              <div className="mt-1 text-xs text-gray-500 line-clamp-2">{group.description || group.code}</div>
                              <div className="mt-2 text-xs text-gray-400">{groupMemberCounts[group.id] || 0} 人使用</div>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <SortableTableHeader column="name" activeColumn={groupSort.sortColumn} direction={groupSort.sortDirection} onSort={groupSort.toggleSort}>权限组</SortableTableHeader>
                          <SortableTableHeader column="code" activeColumn={groupSort.sortColumn} direction={groupSort.sortDirection} onSort={groupSort.toggleSort}>编码</SortableTableHeader>
                          <SortableTableHeader column="description" activeColumn={groupSort.sortColumn} direction={groupSort.sortDirection} onSort={groupSort.toggleSort}>说明</SortableTableHeader>
                          <SortableTableHeader column="memberCount" activeColumn={groupSort.sortColumn} direction={groupSort.sortDirection} onSort={groupSort.toggleSort}>成员数</SortableTableHeader>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">授权</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {groupSort.sortedRows.map((group) => {
                          const checked = activeOperator.role === 'ADMIN' || isAssigned(activeOperator.id, group.id)
                          return (
                            <tr
                              key={group.id}
                              onClick={() => setActiveGroupId(group.id)}
                              className={`cursor-pointer hover:bg-gray-50 ${activeGroupId === group.id ? 'bg-blue-50' : ''}`}
                            >
                              <td className="px-4 py-3 font-medium text-sm">{group.name}</td>
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">{group.code}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{group.description || '-'}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{groupMemberCounts[group.id] || 0}</td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={loading || activeOperator.role === 'ADMIN'}
                                  onChange={() => toggleOperatorGroup(group.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">请从左侧选择一个人员</div>
              )}

              {activeOperator && activeDataScope && (
                <section className="mt-6 border-t border-gray-200 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">业务数据范围</h3>
                      <p className="mt-1 text-sm text-gray-500">功能权限决定能做什么；数据范围决定能看和处理哪些生产任务与库位。</p>
                    </div>
                    {activeDataScope.inheritedLegacyDefault && activeOperator.role !== 'ADMIN' && (
                      <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">旧账号兼容：尚未显式保存，当前为全厂</span>
                    )}
                  </div>

                  {activeOperator.role === 'ADMIN' ? (
                    <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">管理账号固定使用全厂生产与库存范围。</div>
                  ) : (
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="border-b border-gray-100 bg-gray-50 p-4">
                          <label className="block text-sm font-medium text-gray-700">生产数据范围</label>
                          <select
                            value={activeDataScope.productionMode}
                            onChange={(event) => updateActiveDataScope({
                              productionMode: event.target.value as OperatorDataScopeSetting['productionMode'],
                            })}
                            disabled={loading}
                            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="ALL">全厂生产数据</option>
                            <option value="SELF">仅本人派工任务</option>
                            <option value="WORK_CENTERS">指定工作中心</option>
                          </select>
                          {activeDataScope.productionMode === 'SELF' && (
                            <p className={`mt-2 text-xs ${activeOperator.employee?.isActive ? 'text-gray-500' : 'text-red-600'}`}>
                              {activeOperator.employee?.isActive
                                ? `已绑定员工：${activeOperator.employee.code} · ${activeOperator.employee.name}`
                                : '当前账号未绑定在职员工，不能保存“仅本人”。'}
                            </p>
                          )}
                        </div>
                        {activeDataScope.productionMode === 'WORK_CENTERS' ? (
                          <OneToManyRelationField
                            title="允许的工作中心"
                            items={selectedWorkCenters}
                            getKey={(item) => item.id}
                            selector={<RelationSearch
                              items={workCenters}
                              getKey={(item) => item.id}
                              getLabel={(item) => `${item.code} · ${item.name}`}
                              getKeywords={(item) => `${item.code} ${item.name}`}
                              disabledIds={activeDataScope.workCenterIds}
                              onSelect={(item) => updateActiveDataScope({ workCenterIds: [...activeDataScope.workCenterIds, item.id] })}
                              placeholder="搜索并添加工作中心"
                            />}
                            renderIdentity={(item) => <div><div className="text-sm font-medium text-gray-900">{item.name}</div><div className="text-xs text-gray-500">{item.code}</div></div>}
                            onRemove={(item) => updateActiveDataScope({ workCenterIds: activeDataScope.workCenterIds.filter((id) => id !== item.id) })}
                            emptyText="至少添加一个允许的工作中心"
                          />
                        ) : <div className="p-4 text-sm text-gray-500">{activeDataScope.productionMode === 'SELF' ? '列表和状态命令只允许绑定员工的派工任务。' : '可访问全厂生产数据。'}</div>}
                      </div>

                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="border-b border-gray-100 bg-gray-50 p-4">
                          <label className="block text-sm font-medium text-gray-700">库存数据范围</label>
                          <select
                            value={activeDataScope.inventoryMode}
                            onChange={(event) => updateActiveDataScope({
                              inventoryMode: event.target.value as OperatorDataScopeSetting['inventoryMode'],
                            })}
                            disabled={loading}
                            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="ALL">全厂库位</option>
                            <option value="LOCATIONS">指定库位</option>
                          </select>
                        </div>
                        {activeDataScope.inventoryMode === 'LOCATIONS' ? (
                          <OneToManyRelationField
                            title="允许的库位"
                            items={selectedLocations}
                            getKey={(item) => item.id}
                            selector={<RelationSearch
                              items={locations}
                              getKey={(item) => item.id}
                              getLabel={(item) => `${item.code} · ${item.name}`}
                              getKeywords={(item) => `${item.code} ${item.name}`}
                              disabledIds={activeDataScope.locationIds}
                              onSelect={(item) => updateActiveDataScope({ locationIds: [...activeDataScope.locationIds, item.id] })}
                              placeholder="搜索并添加库位"
                            />}
                            renderIdentity={(item) => <div><div className="text-sm font-medium text-gray-900">{item.name}</div><div className="text-xs text-gray-500">{item.code}</div></div>}
                            onRemove={(item) => updateActiveDataScope({ locationIds: activeDataScope.locationIds.filter((id) => id !== item.id) })}
                            emptyText="至少添加一个允许的库位"
                          />
                        ) : <div className="p-4 text-sm text-gray-500">可访问全厂库位；保存指定范围后，查询和写入都会由服务端复检。</div>}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeOperator && activeOperator.role !== 'ADMIN' && (
                <section className="mt-6 border-t border-gray-200 pt-5">
                  <div>
                    <h3 className="font-semibold text-gray-900">个人临时授权</h3>
                    <p className="mt-1 text-sm text-gray-500">只用于岗位组之外的限时例外；必须记录原因、授权人和失效时间。</p>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:grid-cols-2">
                    <select
                      value={temporaryGrant.resource}
                      onChange={(event) => setTemporaryGrant({ ...temporaryGrant, resource: event.target.value })}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">选择功能资源</option>
                      {resources.map((resource) => <option key={resource.key} value={resource.key}>{resource.section} · {resource.label}</option>)}
                    </select>
                    <input
                      value={temporaryGrant.reason}
                      onChange={(event) => setTemporaryGrant({ ...temporaryGrant, reason: event.target.value })}
                      placeholder="授权原因（必填）"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    />
                    <label className="text-sm text-gray-600">开始时间<input type="datetime-local" value={temporaryGrant.startsAt} onChange={(event) => setTemporaryGrant({ ...temporaryGrant, startsAt: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-gray-600">失效时间<input type="datetime-local" value={temporaryGrant.expiresAt} onChange={(event) => setTemporaryGrant({ ...temporaryGrant, expiresAt: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2" /></label>
                    <div className="flex flex-wrap gap-3 lg:col-span-2">
                      {actions.map((action) => <label key={action.key} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={temporaryGrant[action.key]} onChange={() => setTemporaryGrant({ ...temporaryGrant, [action.key]: !temporaryGrant[action.key] })} />
                        {action.label}
                      </label>)}
                    </div>
                    <div className="lg:col-span-2">
                      <AppButton variant="primary" onClick={saveTemporaryGrant} disabled={loading}>保存临时授权</AppButton>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {activePermissionOverrides.map((item) => {
                      const expired = Boolean(item.expiresAt && new Date(item.expiresAt) <= new Date())
                      return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm">
                        <div>
                          <div className="font-medium text-gray-900">{resources.find((resource) => resource.key === item.resource)?.label || item.resource}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {item.legacyPermanent ? '历史永久覆盖，待重新审批' : `${item.startsAt ? new Date(item.startsAt).toLocaleString() : '-'} 至 ${item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '-'}`}
                            {' · '}{item.reason || '未记录原因'}{expired ? ' · 已失效' : ''}
                          </div>
                        </div>
                        <AppButton variant="danger" onClick={() => removeTemporaryGrant(item)} disabled={loading}>移除</AppButton>
                      </div>
                    })}
                    {activePermissionOverrides.length === 0 && <div className="text-sm text-gray-500">当前没有个人例外权限。</div>}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>}

      {mode === 'groups' && <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">权限组赋权</h3>
            <p className="text-sm text-gray-500 mt-1">{activeGroup ? `${activeGroup.name}：${activeGroup.description || '配置这个权限组可访问的功能和操作。'}` : '新增或选择权限组后配置功能权限。'}</p>
          </div>
        </div>

        {showNewGroupForm && (
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] border border-gray-200 rounded-lg p-4 bg-gray-50">
            <input
              value={newGroup.name}
              onChange={(event) => setNewGroup({ ...newGroup, name: event.target.value })}
              placeholder="权限组名称"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
            <input
              value={newGroup.code}
              onChange={(event) => setNewGroup({ ...newGroup, code: event.target.value })}
              placeholder="编码，可留空"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
            <input
              value={newGroup.description}
              onChange={(event) => setNewGroup({ ...newGroup, description: event.target.value })}
              placeholder="说明"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
            <button
              onClick={createGroup}
              disabled={loading || !newGroup.name.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              创建
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {groupSort.sortedRows.map((group) => (
            <button
              key={group.id}
              onClick={() => setActiveGroupId(group.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                activeGroupId === group.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>

        {groupViewMode === 'card' ? (
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {groupedSettings.map(([section, settings]) => <section key={section} className="contents">
              <h4 className="col-span-full mt-2 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-700">{section}</h4>
              {settings.map((setting) => {
                const resource = resources.find((item) => item.key === setting.resource)
                return <div key={setting.resource} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="font-medium text-sm">{resource?.label || setting.resource}</div>
                  <div className="mt-1 text-xs text-gray-400 font-mono">{setting.resource}</div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {actions.map((action) => (
                      <label key={action.key} className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(setting[action.key])}
                          disabled={loading || !activeGroup}
                          onChange={() => toggleGroupSetting(setting.resource, action.key)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300"
                        />
                        <span>
                          <span className="block font-medium text-gray-700">{action.label}</span>
                          <span className="mt-1 block text-xs text-gray-400">{actionHelp[action.key]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              })}
            </section>)}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">功能页</th>
                  {actions.map((action) => (
                    <th key={action.key} className="px-4 py-3 text-center text-sm font-semibold text-gray-600">
                      <div>{action.label}</div>
                      <div className="text-xs font-normal text-gray-400 mt-1">{actionHelp[action.key]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groupedSettings.map(([section, settings]) => <Fragment key={section}>
                  <tr className="bg-slate-100"><th colSpan={actions.length + 1} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">{section}</th></tr>
                  {settings.map((setting) => {
                    const resource = resources.find((item) => item.key === setting.resource)
                    return <tr key={setting.resource} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{resource?.label || setting.resource}</div>
                        <div className="text-xs text-gray-400 font-mono">{setting.resource}</div>
                      </td>
                      {actions.map((action) => (
                        <td key={action.key} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(setting[action.key])}
                            disabled={loading || !activeGroup}
                            onChange={() => toggleGroupSetting(setting.resource, action.key)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                      ))}
                    </tr>
                  })}
                </Fragment>)}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </div>
  )
}
