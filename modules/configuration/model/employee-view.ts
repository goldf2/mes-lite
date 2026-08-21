import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { EmployeeItem } from '../contracts/employee'
import type { EmployeeForm } from '../contracts/employee'

export const createEmptyEmployeeForm = (): EmployeeForm => ({
  name: '',
  department: '',
  phone: '',
  note: '',
  isActive: true,
  operatorId: '',
})

export const employeeOperatorStatusLabels: Record<string, string> = {
  PENDING: '待审核',
  ACTIVE: '已启用',
  REJECTED: '已拒绝',
  DISABLED: '已停用',
}

export const employeeOperatorRoleLabels: Record<string, string> = {
  OPERATOR: '录入',
  AUDITOR: '审核',
  ADMIN: '管理',
}

export const employeeSearchCatalog = defineResourceSearchCatalog<EmployeeItem>('employee.actual-fields', [
  { key: 'code', label: '员工编码', type: 'text', read: (employee) => employee.code },
  { key: 'name', label: '姓名', type: 'text', read: (employee) => employee.name },
  { key: 'department', label: '部门', type: 'text', read: (employee) => employee.department },
  { key: 'phone', label: '联系电话', type: 'text', read: (employee) => employee.phone },
  { key: 'operator', label: '登录账号', type: 'text', read: (employee) => [employee.operator?.username, employee.operator?.name] },
  { key: 'operatorRole', label: '账号角色', type: 'select', read: (employee) => [employee.operator?.role, employee.operator?.role ? employeeOperatorRoleLabels[employee.operator.role] : ''], options: Object.entries(employeeOperatorRoleLabels).map(([value, label]) => ({ value, label })) },
  { key: 'operatorStatus', label: '账号状态', type: 'select', read: (employee) => [employee.operator?.status, employee.operator?.status ? employeeOperatorStatusLabels[employee.operator.status] : ''], options: Object.entries(employeeOperatorStatusLabels).map(([value, label]) => ({ value, label })) },
  { key: 'isActive', label: '员工状态', type: 'select', read: (employee) => employee.isActive ? 'true' : 'false', options: [{ value: 'true', label: '在职' }, { value: 'false', label: '已停用' }] },
  { key: 'note', label: '备注', type: 'text', read: (employee) => employee.note },
  { key: 'createdAt', label: '创建日期', type: 'date', read: (employee) => employee.createdAt },
  { key: 'updatedAt', label: '更新日期', type: 'date', read: (employee) => employee.updatedAt },
])
