import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { employeeOperatorSelect, employeeWithOperator } from './employee-projection'
import { employeeOperatorRoleLabels, employeeOperatorStatusLabels } from '../model/employee-view'

function dateRange(token: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(token)) return null
  const start = new Date(`${token}T00:00:00+08:00`)
  return Number.isNaN(start.getTime()) ? null : { gte: start, lt: new Date(start.getTime() + 86_400_000) }
}

export async function listEmployeeWorkspace(keyword?: string, includeInactive = false) {
  const keywordFilters = tokenizeKeywordQuery(keyword || '').map((token) => ({
    OR: [
      { code: { contains: token } },
      { name: { contains: token } },
      { department: { contains: token } },
      { phone: { contains: token } },
      { note: { contains: token } },
      { operator: { is: { username: { contains: token } } } },
      { operator: { is: { name: { contains: token } } } },
      ...Object.entries(employeeOperatorRoleLabels).filter(([, label]) => label.includes(token)).map(([role]) => ({ operator: { is: { role } } })),
      ...Object.entries(employeeOperatorStatusLabels).filter(([, label]) => label.includes(token)).map(([status]) => ({ operator: { is: { status } } })),
      ...(['在职', '启用'].some((label) => label.includes(token)) ? [{ isActive: true }] : []),
      ...(['停用', '离职'].some((label) => label.includes(token)) ? [{ isActive: false }] : []),
      ...(dateRange(token) ? [{ createdAt: dateRange(token)! }, { updatedAt: dateRange(token)! }] : []),
    ],
  }))
  const where: Prisma.EmployeeWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(keywordFilters.length > 0 ? { AND: keywordFilters } : {}),
  }
  const [employees, operators] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: employeeWithOperator,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.operator.findMany({
      select: {
        ...employeeOperatorSelect,
        employee: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { username: 'asc' }],
    }),
  ])
  return { employees, operators }
}
