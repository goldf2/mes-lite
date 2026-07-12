'use client'

import { useEffect, useMemo, useState } from 'react'

interface ResourceItem {
  key: string
  label: string
}

interface ActionItem {
  key: keyof PermissionFlags
  label: string
}

interface PermissionFlags {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

interface PermissionGroupSetting extends PermissionFlags {
  id?: string
  groupId: string
  resource: string
}

interface PermissionGroup {
  id: string
  code: string
  name: string
  description?: string | null
  isSystem: boolean
  settings: PermissionGroupSetting[]
}

interface OperatorItem {
  id: string
  username: string
  name: string
  role: 'OPERATOR' | 'AUDITOR' | 'ADMIN'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'
}

interface OperatorPermissionGroup {
  id?: string
  operatorId: string
  groupId: string
}

const actionHelp: Record<string, string> = {
  canRead: '查看页面和列表',
  canCreate: '新增单据或资料',
  canUpdate: '编辑、确认、审核、状态流转',
  canDelete: '删除或移除记录',
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

const blankFlags: PermissionFlags = {
  canRead: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
}

export default function PermissionPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [resources, setResources] = useState<ResourceItem[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [operators, setOperators] = useState<OperatorItem[]>([])
  const [groups, setGroups] = useState<PermissionGroup[]>([])
  const [operatorGroups, setOperatorGroups] = useState<OperatorPermissionGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState('')
  const [activeOperatorId, setActiveOperatorId] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPermissions()
  }, [])

  const fetchPermissions = async () => {
    setLoading(true)
    const res = await fetch('/api/permissions')
    const data = await res.json()
    if (res.ok) {
      const fetchedGroups = data.data.groups || []
      setResources(data.data.resources || [])
      setActions(data.data.actions || [])
      setOperators(data.data.operators || [])
      setGroups(fetchedGroups)
      setOperatorGroups(data.data.operatorGroups || [])
      setActiveGroupId((current) => current || fetchedGroups[0]?.id || '')
      setActiveOperatorId((current) => current || data.data.operators?.[0]?.id || '')
    } else {
      onMessage(data.error || '获取权限失败')
    }
    setLoading(false)
  }

  const activeGroup = groups.find((group) => group.id === activeGroupId)
  const activeOperator = operators.find((operator) => operator.id === activeOperatorId)
  const groupMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    operatorGroups.forEach((item) => {
      counts[item.groupId] = (counts[item.groupId] || 0) + 1
    })
    return counts
  }, [operatorGroups])
  const filteredOperators = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return operators

    return operators.filter((operator) => {
      return operator.name.toLowerCase().includes(keyword) ||
        operator.username.toLowerCase().includes(keyword) ||
        (roleLabels[operator.role] || operator.role).toLowerCase().includes(keyword)
    })
  }, [operators, searchKeyword])

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

    const res = await fetch('/api/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorGroups: [selectedAssignment] }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(data.message || '权限组分配已保存')
      await fetchPermissions()
    } else {
      onMessage(data.error || '保存权限组分配失败')
    }
    setLoading(false)
  }

  const saveGroupSettings = async () => {
    if (!activeGroup) return

    setLoading(true)
    const res = await fetch('/api/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: activeGroup.id,
        groupSettings: activeGroup.settings.map(({ id, groupId, ...setting }) => setting),
      }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(data.message || '权限组明细已保存')
      await fetchPermissions()
    } else {
      onMessage(data.error || '保存权限组明细失败')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">权限管理</h2>
            <p className="text-sm text-gray-500 mt-1">权限由人员和权限组构成。人员可加入多个权限组，最终权限按权限组合并。</p>
          </div>
          <button
            onClick={saveAssignment}
            disabled={loading || !activeOperator || activeOperator.role === 'ADMIN'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存当前人员'}
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <div className="px-4 py-3 bg-gray-900 text-white text-sm font-medium">人员列表 ({operators.length})</div>
            <div className="p-3 border-b border-gray-100">
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="搜索账号、姓名或角色"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groups.map((group) => {
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
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">请从左侧选择一个人员</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">{activeGroup?.name || '权限组'}明细</h3>
            <p className="text-sm text-gray-500 mt-1">{activeGroup?.description || '配置这个权限组可访问的功能和操作。'}</p>
          </div>
          <button
            onClick={saveGroupSettings}
            disabled={loading || !activeGroup}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            保存权限组明细
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {groups.map((group) => (
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
              {currentGroupSettings.map((setting) => {
                const resource = resources.find((item) => item.key === setting.resource)
                return (
                  <tr key={setting.resource} className="hover:bg-gray-50">
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
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
