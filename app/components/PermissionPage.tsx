'use client'

import { useEffect, useMemo, useState } from 'react'

interface RoleItem {
  key: 'OPERATOR' | 'AUDITOR' | 'ADMIN'
  label: string
}

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

interface PermissionSetting extends PermissionFlags {
  id?: string
  role: RoleItem['key']
  resource: string
}

interface OperatorItem {
  id: string
  username: string
  name: string
  role: RoleItem['key']
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'
}

interface OperatorPermissionOverride extends PermissionFlags {
  id?: string
  operatorId: string
  resource: string
}

const actionHelp: Record<string, string> = {
  canRead: '查看页面和列表',
  canCreate: '新增单据或资料',
  canUpdate: '编辑、确认、审核、状态流转',
  canDelete: '删除或移除记录',
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

function sameFlags(a: PermissionFlags, b: PermissionFlags) {
  return a.canRead === b.canRead &&
    a.canCreate === b.canCreate &&
    a.canUpdate === b.canUpdate &&
    a.canDelete === b.canDelete
}

export default function PermissionPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [resources, setResources] = useState<ResourceItem[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [settings, setSettings] = useState<PermissionSetting[]>([])
  const [operators, setOperators] = useState<OperatorItem[]>([])
  const [operatorOverrides, setOperatorOverrides] = useState<OperatorPermissionOverride[]>([])
  const [mode, setMode] = useState<'role' | 'operator'>('role')
  const [activeRole, setActiveRole] = useState<RoleItem['key']>('OPERATOR')
  const [activeOperatorId, setActiveOperatorId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPermissions()
  }, [])

  const fetchPermissions = async () => {
    setLoading(true)
    const res = await fetch('/api/permissions')
    const data = await res.json()
    if (res.ok) {
      const fetchedOperators = data.data.operators || []
      setRoles(data.data.roles || [])
      setResources(data.data.resources || [])
      setActions(data.data.actions || [])
      setSettings(data.data.settings || [])
      setOperators(fetchedOperators)
      setOperatorOverrides(data.data.operatorOverrides || [])
      setActiveOperatorId((current) => current || fetchedOperators[0]?.id || '')
    } else {
      onMessage(data.error || '获取权限失败')
    }
    setLoading(false)
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    operators.forEach((operator) => {
      counts[operator.role] = (counts[operator.role] || 0) + 1
    })
    return counts
  }, [operators])

  const settingMap = useMemo(() => {
    const map = new Map<string, PermissionSetting>()
    settings.forEach((setting) => map.set(`${setting.role}:${setting.resource}`, setting))
    return map
  }, [settings])

  const overrideMap = useMemo(() => {
    const map = new Map<string, OperatorPermissionOverride>()
    operatorOverrides.forEach((setting) => map.set(`${setting.operatorId}:${setting.resource}`, setting))
    return map
  }, [operatorOverrides])

  const selectedOperator = operators.find((operator) => operator.id === activeOperatorId)
  const roleLabel = roles.find((role) => role.key === activeRole)?.label || activeRole

  const roleFlags = (role: RoleItem['key'], resource: string): PermissionFlags => {
    const setting = settingMap.get(`${role}:${resource}`)
    if (!setting) return { ...blankFlags }
    return {
      canRead: setting.canRead,
      canCreate: setting.canCreate,
      canUpdate: setting.canUpdate,
      canDelete: setting.canDelete,
    }
  }

  const currentSettings = resources.map((resource) => {
    if (mode === 'role') {
      return settingMap.get(`${activeRole}:${resource.key}`) || {
        role: activeRole,
        resource: resource.key,
        ...blankFlags,
      }
    }

    const base = selectedOperator ? roleFlags(selectedOperator.role, resource.key) : blankFlags
    const override = selectedOperator ? overrideMap.get(`${selectedOperator.id}:${resource.key}`) : null
    return {
      role: selectedOperator?.role || 'OPERATOR',
      operatorId: selectedOperator?.id || '',
      resource: resource.key,
      ...(override || base),
    }
  })

  const toggleRole = (resource: string, action: keyof PermissionFlags) => {
    if (activeRole === 'ADMIN') return
    setSettings((prev) => {
      const key = `${activeRole}:${resource}`
      const existing = prev.find((item) => `${item.role}:${item.resource}` === key)
      if (existing) {
        return prev.map((item) =>
          `${item.role}:${item.resource}` === key
            ? { ...item, [action]: !item[action] }
            : item
        )
      }
      return [
        ...prev,
        {
          role: activeRole,
          resource,
          canRead: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
          [action]: true,
        },
      ]
    })
  }

  const toggleOperator = (resource: string, action: keyof PermissionFlags) => {
    if (!selectedOperator || selectedOperator.role === 'ADMIN') return

    const current = currentSettings.find((item) => item.resource === resource)
    const base = roleFlags(selectedOperator.role, resource)
    const next: PermissionFlags = {
      canRead: Boolean(current?.canRead),
      canCreate: Boolean(current?.canCreate),
      canUpdate: Boolean(current?.canUpdate),
      canDelete: Boolean(current?.canDelete),
      [action]: !current?.[action],
    }

    setOperatorOverrides((prev) => {
      const rest = prev.filter((item) => !(item.operatorId === selectedOperator.id && item.resource === resource))
      if (sameFlags(base, next)) return rest
      return [
        ...rest,
        {
          operatorId: selectedOperator.id,
          resource,
          ...next,
        },
      ]
    })
  }

  const toggle = (resource: string, action: keyof PermissionFlags) => {
    if (mode === 'role') {
      toggleRole(resource, action)
      return
    }
    toggleOperator(resource, action)
  }

  const save = async () => {
    setLoading(true)
    const body = mode === 'role'
      ? { settings }
      : {
          operatorId: selectedOperator?.id,
          operatorOverrides: operatorOverrides
            .filter((item) => item.operatorId === selectedOperator?.id)
            .map(({ id, operatorId, ...flags }) => flags),
        }

    const res = await fetch('/api/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(data.message || '权限已保存')
      await fetchPermissions()
    } else {
      onMessage(data.error || '保存权限失败')
    }
    setLoading(false)
  }

  const targetTitle = mode === 'role'
    ? `${roleLabel}权限矩阵`
    : selectedOperator
    ? `${selectedOperator.name}权限矩阵`
    : '人员权限矩阵'
  const operatorOverrideCount = selectedOperator
    ? operatorOverrides.filter((item) => item.operatorId === selectedOperator.id).length
    : 0
  const checkboxDisabled = loading ||
    (mode === 'role' && activeRole === 'ADMIN') ||
    (mode === 'operator' && (!selectedOperator || selectedOperator.role === 'ADMIN'))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">权限管理</h2>
            <p className="text-sm text-gray-500 mt-1">角色模板统一控制默认权限，人员覆盖用于单独给某个账号加权或限权。</p>
          </div>
          <button
            onClick={save}
            disabled={loading || (mode === 'operator' && !selectedOperator)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存权限'}
          </button>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setMode('role')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              mode === 'role' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            角色模板
          </button>
          <button
            onClick={() => setMode('operator')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              mode === 'operator' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            人员覆盖
          </button>
        </div>

        {mode === 'role' ? (
          <div className="flex flex-wrap gap-2 mt-5">
            {roles.map((role) => (
              <button
                key={role.key}
                onClick={() => setActiveRole(role.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  activeRole === role.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{role.label}</span>
                <span className={`ml-2 text-xs ${activeRole === role.key ? 'text-blue-100' : 'text-gray-400'}`}>
                  {roleCounts[role.key] || 0} 人
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(260px,360px)_1fr]">
            <select
              value={activeOperatorId}
              onChange={(event) => setActiveOperatorId(event.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name} / {operator.username} / {roles.find((role) => role.key === operator.role)?.label || operator.role}
                </option>
              ))}
            </select>
            <div className="text-sm text-gray-500 flex items-center">
              {selectedOperator
                ? `${selectedOperator.name} 当前角色：${roles.find((role) => role.key === selectedOperator.role)?.label || selectedOperator.role}，状态：${statusLabels[selectedOperator.status] || selectedOperator.status}，覆盖项：${operatorOverrideCount}`
                : '暂无可配置人员'}
            </div>
          </div>
        )}

        {mode === 'role' && activeRole === 'ADMIN' && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm">
            管理角色默认拥有全部权限，为避免误关权限管理入口，这一组保持全开。
          </div>
        )}
        {mode === 'operator' && selectedOperator?.role === 'ADMIN' && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm">
            管理账号固定拥有全部权限，人员覆盖不会限制管理账号。
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {targetTitle}
            {mode === 'role' && (
              <span className="ml-2 text-sm font-normal text-gray-500">当前 {roleCounts[activeRole] || 0} 人使用</span>
            )}
            {mode === 'operator' && selectedOperator && (
              <span className="ml-2 text-sm font-normal text-gray-500">基于 {roles.find((role) => role.key === selectedOperator.role)?.label || selectedOperator.role} 角色</span>
            )}
          </h3>
          <button onClick={fetchPermissions} disabled={loading} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            刷新
          </button>
        </div>

        <div className="overflow-x-auto">
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
              {currentSettings.map((setting) => {
                const resource = resources.find((item) => item.key === setting.resource)
                const hasOverride = mode === 'operator' && selectedOperator && overrideMap.has(`${selectedOperator.id}:${setting.resource}`)
                return (
                  <tr key={setting.resource} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">
                        {resource?.label || setting.resource}
                        {hasOverride && <span className="ml-2 text-xs text-blue-600">已覆盖</span>}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">{setting.resource}</div>
                    </td>
                    {actions.map((action) => (
                      <td key={action.key} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(setting[action.key])}
                          disabled={checkboxDisabled}
                          onChange={() => toggle(setting.resource, action.key)}
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
