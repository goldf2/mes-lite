import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { OperatorAdminItem } from '../contracts/operator-admin'

export const operatorSearchFieldKeys = ['username', 'name', 'phone', 'role', 'status', 'approvedBy', 'approvedAt', 'lastLoginAt', 'createdAt', 'updatedAt'] as const
export const operatorRoleOptions = [{ value: 'OPERATOR', label: '提交' }, { value: 'AUDITOR', label: '审核' }, { value: 'ADMIN', label: '管理' }]
export const operatorStatusOptions = [{ value: 'PENDING', label: '待审核' }, { value: 'ACTIVE', label: '已启用' }, { value: 'REJECTED', label: '已拒绝' }, { value: 'DISABLED', label: '已停用' }]

export const operatorSearchCatalog = defineResourceSearchCatalog<OperatorAdminItem>('operator.actual-fields', [
  { key: 'username', label: '登录账号', type: 'text', read: (item) => item.username },
  { key: 'name', label: '姓名', type: 'text', read: (item) => item.name },
  { key: 'phone', label: '手机号', type: 'text', read: (item) => item.phone },
  { key: 'role', label: '角色', type: 'select', read: (item) => [item.role, operatorRoleOptions.find((option) => option.value === item.role)?.label], options: operatorRoleOptions },
  { key: 'status', label: '账号状态', type: 'select', read: (item) => [item.status, operatorStatusOptions.find((option) => option.value === item.status)?.label], options: operatorStatusOptions },
  { key: 'approvedBy', label: '审批人', type: 'text', read: (item) => item.approvedBy },
  { key: 'approvedAt', label: '审批日期', type: 'date', read: (item) => item.approvedAt },
  { key: 'lastLoginAt', label: '最后登录日期', type: 'date', read: (item) => item.lastLoginAt },
  { key: 'createdAt', label: '注册日期', type: 'date', read: (item) => item.createdAt },
  { key: 'updatedAt', label: '更新日期', type: 'date', read: (item) => item.updatedAt },
])
