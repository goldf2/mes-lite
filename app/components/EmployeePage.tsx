'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppButton from './AppButton'
import { appInputClassName, appSelectClassName, appTextareaClassName } from './FormField'
import ModalDialog, { ModalActions } from './ModalDialog'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'
import { SearchFieldWithPresets } from './SavedSearchPresets'
import SortableTableHeader from './SortableTableHeader'
import TopBarPortal from './TopBarPortal'
import useClientTableSort from './useClientTableSort'

interface EmployeeItem {
  id: string
  code: string
  name: string
  department?: string | null
  phone?: string | null
  note?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const emptyForm = () => ({
  code: '',
  name: '',
  department: '',
  phone: '',
  note: '',
  isActive: true,
})

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
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<EmployeeItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ includeInactive: '1' })
      if (keyword.trim()) params.set('keyword', keyword.trim())
      const response = await fetch(`/api/employees?${params}`)
      const data = await response.json()
      if (!response.ok) return onMessage(data.error || '获取员工资料失败')
      setEmployees(data.data || [])
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
    code: (employee) => employee.code,
    name: (employee) => employee.name,
    department: (employee) => employee.department || '',
    phone: (employee) => employee.phone || '',
    status: (employee) => employee.isActive ? '在职' : '停用',
  }, 'code', 'asc')

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (employee: EmployeeItem) => {
    setEditing(employee)
    setForm({
      code: employee.code,
      name: employee.name,
      department: employee.department || '',
      phone: employee.phone || '',
      note: employee.note || '',
      isActive: employee.isActive,
    })
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return onMessage('请填写员工编码和姓名')
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

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.employees" value={keyword} onChange={setKeyword} placeholder="搜索员工编码、姓名、部门或电话" />}
          filters={(
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={`w-36 ${appSelectClassName}`}>
              <option value="ALL">全部状态</option>
              <option value="ACTIVE">在职</option>
              <option value="INACTIVE">已停用</option>
            </select>
          )}
          actions={canCreate ? <AppButton variant="create" onClick={openCreate}>新增员工</AppButton> : null}
        />
      </TopBarPortal>

      <div className="space-y-4">
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">员工资料</h2>
          <p className="mt-1 text-sm text-gray-500">业务员工档案用于生产记录和流程转移选人；不会自动创建登录账号或授予系统权限。</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded bg-blue-50 px-3 py-1.5 text-blue-700">员工总数 {employees.length}</span>
            <span className="rounded bg-emerald-50 px-3 py-1.5 text-emerald-700">在职 {activeCount}</span>
            <span className="rounded bg-gray-100 px-3 py-1.5 text-gray-600">停用 {employees.length - activeCount}</span>
          </div>
        </section>

        <section className="rounded-lg bg-white p-3 shadow-sm sm:p-6">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-500">加载中...</div>
          ) : visibleEmployees.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">暂无员工资料</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[820px]">
                <thead className="bg-gray-50 text-sm text-gray-600"><tr>
                  <SortableTableHeader column="code" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>员工编码</SortableTableHeader>
                  <SortableTableHeader column="name" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>姓名</SortableTableHeader>
                  <SortableTableHeader column="department" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>部门</SortableTableHeader>
                  <SortableTableHeader column="phone" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>联系电话</SortableTableHeader>
                  <SortableTableHeader column="status" activeColumn={tableSort.sortColumn} direction={tableSort.sortDirection} onSort={tableSort.toggleSort}>状态</SortableTableHeader>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">{tableSort.sortedRows.map((employee) => (
                  <tr key={employee.id} className="text-sm hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-blue-700">{employee.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900"><div>{employee.name}</div>{employee.note && <div className="mt-1 max-w-xs truncate text-xs font-normal text-gray-400">{employee.note}</div>}</td>
                    <td className="px-4 py-3 text-gray-600">{employee.department || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{employee.phone || '-'}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${employee.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{employee.isActive ? '在职' : '已停用'}</span></td>
                    <td className="px-4 py-3 text-right">{canUpdate && <AppButton size="sm" onClick={() => openEdit(employee)}>编辑</AppButton>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {formOpen && (
        <ModalDialog
          title={editing ? '编辑员工' : '新增员工'}
          description="员工编码用于稳定识别人员；停用后不可再用于新单据，但不影响历史记录。"
          onClose={() => setFormOpen(false)}
          closeDisabled={saving}
          footer={<ModalActions onCancel={() => setFormOpen(false)} onConfirm={save} busy={saving} />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">员工编码 *<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={`mt-2 ${appInputClassName}`} placeholder="如 E001" /></label>
            <label className="text-sm font-medium text-gray-700">姓名 *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">部门<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700">联系电话<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={`mt-2 ${appInputClassName}`} /></label>
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">备注<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} className={`mt-2 ${appTextareaClassName}`} /></label>
            {editing && <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />允许用于新业务单据</label>}
          </div>
        </ModalDialog>
      )}
    </>
  )
}
