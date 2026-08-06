'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from './AppButton'
import { appInputClassName, appSelectClassName, appTextareaClassName } from './FormField'
import ModalDialog, { ModalActions } from './ModalDialog'
import useClientTableSort from './useClientTableSort'
import SearchableSelect from './SearchableSelect'
import ConfigurationManualOrder from './ConfigurationManualOrder'
import ResourcePage from './resource/ResourcePage'
import { usePersistedViewMode } from './ViewModeToggle'
import ManyToOneRelationField from './relations/ManyToOneRelationField'
import ResourceSortButton from './resource/ResourceSortButton'

interface OperatorOption {
  id: string
  username: string
  name: string
  role: string
  status: string
  employee?: { id: string; code: string; name: string } | null
}

interface EmployeeItem {
  id: string
  code: string
  name: string
  department?: string | null
  phone?: string | null
  note?: string | null
  isActive: boolean
  operatorId?: string | null
  operator?: Omit<OperatorOption, 'employee'> | null
  createdAt: string
  updatedAt: string
  sortOrder: number
}

const emptyForm = () => ({
  name: '',
  department: '',
  phone: '',
  note: '',
  isActive: true,
  operatorId: '',
})

const operatorStatusLabels: Record<string, string> = {
  PENDING: '待审核',
  ACTIVE: '已启用',
  REJECTED: '已拒绝',
  DISABLED: '已停用',
}

const operatorRoleLabels: Record<string, string> = {
  OPERATOR: '录入',
  AUDITOR: '审核',
  ADMIN: '管理',
}

export default function EmployeePage({
  onMessage,
  canCreate,
  canUpdate,
}: {
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
}) {
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<EmployeeItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.employees.viewMode', 'list')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ includeInactive: '1' })
      if (keyword.trim()) params.set('keyword', keyword.trim())
      const response = await fetch(`/api/employees?${params}`)
      const data = await response.json()
      if (!response.ok) return onMessage(data.error || '获取员工资料失败')
      setEmployees(data.data || [])
      setOperators(data.operators || [])
    } catch {
      onMessage('获取员工资料失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, onMessage])

  useEffect(() => {
    const timer = window.setTimeout(loadData, 180)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const visibleEmployees = useMemo(() => employees.filter((employee) => (
    status === 'ALL' || (status === 'ACTIVE' ? employee.isActive : !employee.isActive)
  )), [employees, status])
  const tableSort = useClientTableSort(visibleEmployees, {
    manual: (employee) => employee.sortOrder,
    code: (employee) => employee.code,
    name: (employee) => employee.name,
    department: (employee) => employee.department || '',
    phone: (employee) => employee.phone || '',
    operator: (employee) => employee.operator ? `${employee.operator.username} ${employee.operator.name}` : '',
    status: (employee) => employee.isActive ? '在职' : '停用',
  }, 'manual', 'asc')

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (employee: EmployeeItem) => {
    setEditing(employee)
    setForm({
      name: employee.name,
      department: employee.department || '',
      phone: employee.phone || '',
      note: employee.note || '',
      isActive: employee.isActive,
      operatorId: employee.operatorId || '',
    })
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return onMessage('请填写员工姓名')
    setSaving(true)
    try {
      const response = await fetch('/api/employees', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...form, id: editing.id } : form),
      })
      const data = await response.json()
      if (!response.ok) return onMessage(data.error || '保存员工资料失败')
      onMessage(data.message || '员工资料已保存')
      setFormOpen(false)
      await loadData()
    } catch {
      onMessage('保存员工资料失败')
    } finally {
      setSaving(false)
    }
  }

  const activeCount = employees.filter((employee) => employee.isActive).length
  const boundCount = employees.filter((employee) => employee.operatorId).length
  const operatorOptions = useMemo(() => operators.map((operator) => ({
    value: operator.id,
    label: `${operator.username} · ${operator.name} · ${operatorStatusLabels[operator.status] || operator.status}`,
    keywords: `${operator.username} ${operator.name} ${operatorRoleLabels[operator.role] || operator.role}`,
    disabled: Boolean(operator.employee && operator.employee.id !== editing?.id),
  })), [editing?.id, operators])
  const selectedOperator = operators.find((operator) => operator.id === form.operatorId) || null

  const sortLabel = (column: string, label: string) => {
    return (
      <ResourceSortButton column={column} label={label} activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort} />
    )
  }

  const columns = [
    { key: 'code', label: sortLabel('code', '员工编码'), render: (employee: EmployeeItem) => <span className="font-mono font-medium text-blue-700">{employee.code}</span> },
    { key: 'name', label: sortLabel('name', '姓名'), render: (employee: EmployeeItem) => <><div className="font-medium text-gray-900">{employee.name}</div>{employee.note && <div className="mt-1 max-w-xs truncate text-xs text-gray-400">{employee.note}</div>}</> },
    { key: 'department', label: sortLabel('department', '部门'), render: (employee: EmployeeItem) => employee.department || '-', hideBelow: 'sm' as const },
    { key: 'phone', label: sortLabel('phone', '联系电话'), render: (employee: EmployeeItem) => employee.phone || '-', hideBelow: 'lg' as const },
    { key: 'operator', label: sortLabel('operator', '登录账号'), render: (employee: EmployeeItem) => employee.operator ? <><div className="font-mono text-xs text-violet-700">{employee.operator.username}</div><div className="mt-1 text-xs text-gray-400">{employee.operator.name} · {operatorStatusLabels[employee.operator.status] || employee.operator.status}</div></> : '-', hideBelow: 'md' as const },
    { key: 'status', label: sortLabel('status', '状态'), render: (employee: EmployeeItem) => <span className={`rounded px-2 py-1 text-xs ${employee.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{employee.isActive ? '在职' : '已停用'}</span> },
    { key: 'actions', label: <span className="block text-right">操作</span>, headerClassName: 'text-right', className: 'text-right', render: (employee: EmployeeItem) => canUpdate ? <AppButton size="sm" onClick={() => openEdit(employee)}>编辑</AppButton> : null },
  ]

  return (
    <>
      <ResourcePage
        resourceKey="employees"
        title="员工资料"
        description="业务员工用于生产实绩和流程转移；账号关联不会改变角色或权限。"
        items={tableSort.sortedRows}
        getKey={(employee) => employee.id}
        columns={columns}
        renderCard={({ item: employee }) => (
          <>
            <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-xs font-medium text-blue-700">{employee.code}</div><h3 className="mt-1 font-semibold text-gray-900">{employee.name}</h3></div><span className={`rounded px-2 py-1 text-xs ${employee.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{employee.isActive ? '在职' : '已停用'}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600"><div><span className="text-xs text-gray-400">部门</span><div>{employee.department || '-'}</div></div><div><span className="text-xs text-gray-400">联系电话</span><div>{employee.phone || '-'}</div></div><div className="col-span-2"><span className="text-xs text-gray-400">登录账号</span><div>{employee.operator ? `${employee.operator.username} · ${employee.operator.name}` : '-'}</div></div></div>
            {employee.note && <div className="mt-3 line-clamp-2 rounded bg-gray-50 p-3 text-xs text-gray-600">{employee.note}</div>}
            {canUpdate && <div className="mt-4 flex justify-end"><AppButton size="sm" onClick={() => openEdit(employee)}>编辑</AppButton></div>}
          </>
        )}
        loading={loading}
        loadingLabel="正在加载员工资料..."
        emptyLabel="暂无员工资料"
        emptyAction={canCreate ? <AppButton variant="create" onClick={openCreate}>新建第一位员工</AppButton> : undefined}
        searchValue={keyword}
        onSearchChange={setKeyword}
        searchPlaceholder="搜索员工编码、姓名、部门、电话或登录账号"
        filters={<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={`w-36 ${appSelectClassName}`}><option value="ALL">全部状态</option><option value="ACTIVE">在职</option><option value="INACTIVE">已停用</option></select>}
        filterCount={status === 'ALL' ? 0 : 1}
        actions={canUpdate ? <ConfigurationManualOrder entity="employees" label="员工" onMessage={onMessage} onSaved={loadData} /> : undefined}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="新建员工"
        summary={<span className="text-sm text-gray-500">共 {employees.length} 人 · 在职 {activeCount} · 已绑定 {boundCount}</span>}
        rowLabel={(employee) => `${employee.code} ${employee.name}`}
      />

      {formOpen && (
        <ModalDialog
          title={editing ? '编辑员工' : '新建员工'}
          description="员工编码由系统生成且保存后不可修改；注册账号绑定不会改变账号角色、审核状态或权限。"
          onClose={() => setFormOpen(false)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setFormOpen(false)} onConfirm={save} busy={saving} />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              员工编码
              <input value={editing?.code || '保存后自动生成'} readOnly disabled className={`mt-2 bg-gray-50 text-gray-500 ${appInputClassName}`} />
              <span className="mt-1 block text-xs font-normal text-gray-400">系统编码与数据库内部 ID 分离，不支持手工修改。</span>
            </label>
            <label className="text-sm font-medium text-gray-700">姓名 *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">部门<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">联系电话<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <div className="sm:col-span-2">
              <ManyToOneRelationField
                title="绑定注册账号"
                item={selectedOperator}
                selector={<SearchableSelect value={form.operatorId} onChange={(operatorId) => setForm({ ...form, operatorId })} options={operatorOptions} placeholder="输入登录账号或姓名筛选（可不绑定）" allowClear />}
                renderIdentity={(operator) => <><div className="text-sm font-medium text-gray-900">{operator.name}</div><div className="font-mono text-xs text-gray-500">{operator.username} · {operatorStatusLabels[operator.status] || operator.status}</div></>}
                onRemove={() => setForm({ ...form, operatorId: '' })}
                emptyText="可不绑定账号；已绑定其他员工的账号不能重复选择。"
              />
              <span className="mt-1 block text-xs text-gray-400">绑定不会改变账号角色、审核状态或权限。</span>
            </div>
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">备注<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} className={`mt-2 ${appTextareaClassName}`} /></label>
            {editing && <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />允许用于新业务单据</label>}
          </div>
        </ModalDialog>
      )}
    </>
  )
}
