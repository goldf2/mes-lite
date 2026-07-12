'use client'

import { useEffect, useState } from 'react'
import { CurrentOperator } from './AuthGate'

interface Operator {
  id: string
  username: string
  name: string
  phone?: string
  role: 'OPERATOR' | 'AUDITOR' | 'ADMIN'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'
  approvedAt?: string
  approvedBy?: string
  lastLoginAt?: string
  createdAt: string
}

const roleLabels: Record<string, string> = {
  OPERATOR: '提交',
  AUDITOR: '审核',
  ADMIN: '管理',
}

const statusLabels: Record<string, string> = {
  PENDING: '待审核',
  ACTIVE: '已启用',
  REJECTED: '已拒绝',
  DISABLED: '已停用',
}

const statusClasses: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ACTIVE: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  DISABLED: 'bg-gray-100 text-gray-700',
}

export default function OperatorPage({
  currentOperator,
  onMessage,
}: {
  currentOperator: CurrentOperator
  onMessage: (msg: string) => void
}) {
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(false)

  const canManage = currentOperator.role === 'ADMIN'
  const totalCount = operators.length
  const activeCount = operators.filter((operator) => operator.status === 'ACTIVE').length
  const pendingCount = operators.filter((operator) => operator.status === 'PENDING').length
  const disabledCount = operators.filter((operator) => operator.status === 'DISABLED').length

  useEffect(() => {
    fetchOperators()
  }, [])

  const fetchOperators = async () => {
    setLoading(true)
    const res = await fetch('/api/operators')
    const data = await res.json()
    if (res.ok) {
      setOperators(data.data || [])
    } else {
      onMessage(data.error || '获取操作人员失败')
    }
    setLoading(false)
  }

  const updateOperator = async (payload: { id: string; status?: string; role?: string }) => {
    setLoading(true)
    const res = await fetch('/api/operators', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage('操作人员已更新')
      await fetchOperators()
    } else {
      onMessage(data.error || '更新失败')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">人员管理</h2>
          <p className="text-sm text-gray-500 mt-1">注册人员先进入待审核，通过后才能进入系统。</p>
        </div>
        <button onClick={fetchOperators} disabled={loading} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="总人员" value={`${totalCount} 人`} />
        <SummaryCard label="已启用" value={`${activeCount} 人`} />
        <SummaryCard label="待审核" value={`${pendingCount} 人`} />
        <SummaryCard label="已停用" value={`${disabledCount} 人`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">账号</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">姓名</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">手机号</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">角色</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">状态</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">注册时间</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {operators.map((operator) => (
              <tr key={operator.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-700 text-sm">{operator.username}</td>
                <td className="px-4 py-3 font-medium text-sm">{operator.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{operator.phone || '-'}</td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select
                      value={operator.role}
                      disabled={loading}
                      onChange={(e) => updateOperator({ id: operator.id, role: e.target.value })}
                      className="px-2 py-1 border border-gray-200 rounded text-sm"
                    >
                      <option value="OPERATOR">提交</option>
                      <option value="AUDITOR">审核</option>
                      <option value="ADMIN">管理</option>
                    </select>
                  ) : (
                    <span className="text-sm">{roleLabels[operator.role]}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusClasses[operator.status]}`}>
                    {statusLabels[operator.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(operator.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {operator.status !== 'ACTIVE' && operator.status !== 'DISABLED' && (
                      <button
                        disabled={loading}
                        onClick={() => updateOperator({ id: operator.id, status: 'ACTIVE' })}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                      >
                        通过
                      </button>
                    )}
                    {operator.status === 'PENDING' && (
                      <button
                        disabled={loading}
                        onClick={() => updateOperator({ id: operator.id, status: 'REJECTED' })}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                      >
                        拒绝
                      </button>
                    )}
                    {operator.status === 'ACTIVE' && operator.id !== currentOperator.id && (
                      <button
                        disabled={loading}
                        onClick={() => updateOperator({ id: operator.id, status: 'DISABLED' })}
                        className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        停用
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {operators.length === 0 && <div className="text-center py-12 text-gray-500">暂无操作人员</div>}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
