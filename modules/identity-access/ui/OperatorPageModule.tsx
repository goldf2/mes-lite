'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type { CurrentOperator } from '@/app/components/AuthGate'
import { appInputClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import useClientTableSort from '@/app/components/useClientTableSort'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import {
  deleteOperator as deleteOperatorRequest,
  loadOperators,
  updateOperator as updateOperatorRequest,
} from '../client/identity-access-api'
import type { OperatorAdminItem, OperatorRole, UpdateOperatorInput } from '../contracts/operator-admin'

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

const statusOptions = [
  { value: 'PENDING', label: '待审核' },
  { value: 'ACTIVE', label: '已启用' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'DISABLED', label: '已停用' },
]

export default function OperatorPageModule({
  currentOperator,
  onMessage,
  onToolbarChange,
}: {
  currentOperator: CurrentOperator
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [operators, setOperators] = useState<OperatorAdminItem[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [loading, setLoading] = useState(false)
  const [editingOperator, setEditingOperator] = useState<OperatorAdminItem | null>(null)
  const [profileForm, setProfileForm] = useState({ username: '', name: '', phone: '' })
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.operators.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [{
    key: 'status',
    label: '账号状态',
    value: selectedStatuses.length === 1 ? selectedStatuses[0] : '',
    onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)),
    options: statusOptions,
  }], [selectedStatuses])
  const operatorSort = useClientTableSort(operators, {
    username: (operator) => operator.username,
    name: (operator) => operator.name,
    phone: (operator) => operator.phone,
    role: (operator) => roleLabels[operator.role],
    status: (operator) => statusLabels[operator.status],
    createdAt: (operator) => new Date(operator.createdAt),
  }, 'createdAt', 'desc')

  const canManage = currentOperator.role === 'ADMIN'
  const canDelete = currentOperator.permissions?.operators?.canDelete ?? currentOperator.role === 'ADMIN'
  const totalCount = operators.length
  const activeCount = operators.filter((operator) => operator.status === 'ACTIVE').length
  const pendingCount = operators.filter((operator) => operator.status === 'PENDING').length
  const disabledCount = operators.filter((operator) => operator.status === 'DISABLED').length

  const fetchOperators = useCallback(async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      setOperators(await loadOperators(query))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取操作人员失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage, selectedStatuses])

  useEffect(() => {
    void fetchOperators()
  }, [fetchOperators])

  const updateOperator = async (payload: UpdateOperatorInput) => {
    setLoading(true)
    try {
      await updateOperatorRequest(payload)
      onMessage('操作人员已更新')
      await fetchOperators()
      return true
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '更新失败')
      return false
    } finally {
      setLoading(false)
    }
  }

  const editOperatorProfile = (operator: OperatorAdminItem) => {
    setEditingOperator(operator)
    setProfileForm({ username: operator.username, name: operator.name, phone: operator.phone || '' })
  }

  const saveOperatorProfile = async () => {
    if (!editingOperator) return
    if (!profileForm.username.trim() || !profileForm.name.trim()) {
      onMessage('登录账号和姓名不能为空')
      return
    }
    const updated = await updateOperator({
      id: editingOperator.id,
      username: profileForm.username,
      name: profileForm.name,
      phone: profileForm.phone,
    })
    if (updated) setEditingOperator(null)
  }

  const deleteOperator = async (operator: OperatorAdminItem) => {
    if (!window.confirm(`确认删除人员账号“${operator.name}（${operator.username}）”？\n仅无员工、业务和审计关联的非启用账号可以删除；删除后无法撤销。`)) return
    setLoading(true)
    try {
      await deleteOperatorRequest(operator.id)
      onMessage('人员账号已删除')
      await fetchOperators()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '删除失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
        viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        actions={(
          <>
            <button onClick={fetchOperators} disabled={loading} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              刷新
            </button>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [advancedSearchFields, fetchOperators, onToolbarChange, loading, viewMode, setViewMode])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={(
            <>
              <button onClick={fetchOperators} disabled={loading} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                刷新
              </button>
            </>
          )}
        />
      </TopBarPortal>
      <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <div>
          <h2 className="text-xl font-semibold">人员管理</h2>
          <p className="text-sm text-gray-500 mt-1">注册人员先进入待审核，通过后才能进入系统。</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="总人员" value={`${totalCount} 人`} />
        <SummaryCard label="已启用" value={`${activeCount} 人`} />
        <SummaryCard label="待审核" value={`${pendingCount} 人`} />
        <SummaryCard label="已停用" value={`${disabledCount} 人`} />
      </div>

      {viewMode === 'card' && operators.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {operatorSort.sortedRows.map((operator) => (
            <div key={operator.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{operator.name}</div>
                  <div className="mt-1 font-mono text-sm text-blue-700">{operator.username}</div>
                </div>
                <span className={`inline-block shrink-0 px-2 py-1 rounded text-xs font-medium ${statusClasses[operator.status]}`}>
                  {statusLabels[operator.status]}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">手机号</div>
                  <div className="mt-1 text-gray-800">{operator.phone || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">注册时间</div>
                  <div className="mt-1 text-gray-800">{new Date(operator.createdAt).toLocaleString('zh-CN')}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-gray-500">角色</div>
                {canManage ? (
                  <select
                    value={operator.role}
                    disabled={loading}
                    onChange={(e) => updateOperator({ id: operator.id, role: e.target.value as OperatorRole })}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded text-sm"
                  >
                    <option value="OPERATOR">提交</option>
                    <option value="AUDITOR">审核</option>
                    <option value="ADMIN">管理</option>
                  </select>
                ) : (
                  <div className="mt-1 text-sm text-gray-800">{roleLabels[operator.role]}</div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {canManage && (
                  <button
                    disabled={loading}
                    onClick={() => editOperatorProfile(operator)}
                    className="px-3 py-1 border border-blue-200 text-blue-700 rounded text-xs hover:bg-blue-50 disabled:opacity-50"
                  >
                    编辑资料
                  </button>
                )}
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
                {operator.status === 'DISABLED' && (
                  <button
                    disabled={loading}
                    onClick={() => updateOperator({ id: operator.id, status: 'ACTIVE' })}
                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                  >
                    恢复
                  </button>
                )}
                {canDelete && operator.status !== 'ACTIVE' && operator.id !== currentOperator.id && (
                  <button
                    disabled={loading}
                    onClick={() => deleteOperator(operator)}
                    className="px-3 py-1 border border-red-200 text-red-700 rounded text-xs hover:bg-red-50 disabled:opacity-50"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortableTableHeader column="username" activeColumn={operatorSort.sortColumn} direction={operatorSort.sortDirection} onSort={operatorSort.toggleSort}>账号</SortableTableHeader>
                <SortableTableHeader column="name" activeColumn={operatorSort.sortColumn} direction={operatorSort.sortDirection} onSort={operatorSort.toggleSort}>姓名</SortableTableHeader>
                <SortableTableHeader column="phone" activeColumn={operatorSort.sortColumn} direction={operatorSort.sortDirection} onSort={operatorSort.toggleSort}>手机号</SortableTableHeader>
                <SortableTableHeader column="role" activeColumn={operatorSort.sortColumn} direction={operatorSort.sortDirection} onSort={operatorSort.toggleSort}>角色</SortableTableHeader>
                <SortableTableHeader column="status" activeColumn={operatorSort.sortColumn} direction={operatorSort.sortDirection} onSort={operatorSort.toggleSort}>状态</SortableTableHeader>
                <SortableTableHeader column="createdAt" activeColumn={operatorSort.sortColumn} direction={operatorSort.sortDirection} onSort={operatorSort.toggleSort}>注册时间</SortableTableHeader>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {operatorSort.sortedRows.map((operator) => (
                <tr key={operator.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-blue-700 text-sm">{operator.username}</td>
                  <td className="px-4 py-3 font-medium text-sm">{operator.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{operator.phone || '-'}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        value={operator.role}
                        disabled={loading}
                        onChange={(e) => updateOperator({ id: operator.id, role: e.target.value as OperatorRole })}
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
                    <div className="flex flex-wrap gap-2">
                      {canManage && (
                        <button
                          disabled={loading}
                          onClick={() => editOperatorProfile(operator)}
                          className="px-3 py-1 border border-blue-200 text-blue-700 rounded text-xs hover:bg-blue-50 disabled:opacity-50"
                        >
                          编辑资料
                        </button>
                      )}
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
                      {operator.status === 'DISABLED' && (
                        <button
                          disabled={loading}
                          onClick={() => updateOperator({ id: operator.id, status: 'ACTIVE' })}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                        >
                          恢复
                        </button>
                      )}
                      {canDelete && operator.status !== 'ACTIVE' && operator.id !== currentOperator.id && (
                        <button
                          disabled={loading}
                          onClick={() => deleteOperator(operator)}
                          className="px-3 py-1 border border-red-200 text-red-700 rounded text-xs hover:bg-red-50 disabled:opacity-50"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {operators.length === 0 && <div className="text-center py-12 text-gray-500">暂无操作人员</div>}
      </div>
      {editingOperator && (
        <ModalDialog
          title={`编辑账号资料 · ${editingOperator.username}`}
          description="仅管理员可以修改登录账号、姓名和手机号；修改内容会记录到审计日志。"
          onClose={() => setEditingOperator(null)}
          closeDisabled={loading}
          fullscreenable={false}
          footer={(
            <ModalActions
              onCancel={() => setEditingOperator(null)}
              onConfirm={saveOperatorProfile}
              confirmLabel="保存资料"
              busy={loading}
              disabled={!profileForm.username.trim() || !profileForm.name.trim()}
            />
          )}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              登录账号 *
              <input
                value={profileForm.username}
                onChange={(event) => setProfileForm({ ...profileForm, username: event.target.value })}
                className={`mt-2 ${appInputClassName}`}
                maxLength={32}
                autoComplete="off"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              姓名 *
              <input
                value={profileForm.name}
                onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                className={`mt-2 ${appInputClassName}`}
                maxLength={50}
                autoComplete="off"
              />
            </label>
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">
              手机号
              <input
                value={profileForm.phone}
                onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })}
                className={`mt-2 ${appInputClassName}`}
                maxLength={30}
                inputMode="tel"
                autoComplete="off"
                placeholder="留空即清除手机号"
              />
            </label>
          </div>
        </ModalDialog>
      )}
    </>
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
