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

const actionHelp: Record<string, string> = {
  canRead: '查看页面和列表',
  canCreate: '新增单据或资料',
  canUpdate: '编辑、确认、审核、状态流转',
  canDelete: '删除或移除记录',
}

export default function PermissionPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [resources, setResources] = useState<ResourceItem[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [settings, setSettings] = useState<PermissionSetting[]>([])
  const [activeRole, setActiveRole] = useState<RoleItem['key']>('OPERATOR')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPermissions()
  }, [])

  const fetchPermissions = async () => {
    setLoading(true)
    const res = await fetch('/api/permissions')
    const data = await res.json()
    if (res.ok) {
      setRoles(data.data.roles || [])
      setResources(data.data.resources || [])
      setActions(data.data.actions || [])
      setSettings(data.data.settings || [])
    } else {
      onMessage(data.error || '获取权限失败')
    }
    setLoading(false)
  }

  const settingMap = useMemo(() => {
    const map = new Map<string, PermissionSetting>()
    settings.forEach((setting) => map.set(`${setting.role}:${setting.resource}`, setting))
    return map
  }, [settings])

  const currentSettings = resources.map((resource) => {
    return settingMap.get(`${activeRole}:${resource.key}`) || {
      role: activeRole,
      resource: resource.key,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    }
  })

  const toggle = (resource: string, action: keyof PermissionFlags) => {
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

  const save = async () => {
    setLoading(true)
    const res = await fetch('/api/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage('权限已保存')
      await fetchPermissions()
    } else {
      onMessage(data.error || '保存权限失败')
    }
    setLoading(false)
  }

  const roleLabel = roles.find((role) => role.key === activeRole)?.label || activeRole

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">权限管理</h2>
            <p className="text-sm text-gray-500 mt-1">按角色配置每个功能页的查、增、改、删权限。</p>
          </div>
          <button
            onClick={save}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存权限'}
          </button>
        </div>

        <div className="flex gap-2 mt-6">
          {roles.map((role) => (
            <button
              key={role.key}
              onClick={() => setActiveRole(role.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                activeRole === role.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>

        {activeRole === 'ADMIN' && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm">
            管理角色默认拥有全部权限，为避免误关权限管理入口，这一组保持全开。
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{roleLabel}权限矩阵</h3>
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
                          disabled={activeRole === 'ADMIN' || loading}
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

