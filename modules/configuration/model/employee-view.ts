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
