import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { employeeOperatorSelect, employeeWithOperator } from './employee-projection'

export async function listEmployeeWorkspace(keyword?: string, includeInactive = false) {
  const keywordFilters = tokenizeKeywordQuery(keyword || '').map((token) => ({
    OR: [
      { code: { contains: token } },
      { name: { contains: token } },
      { department: { contains: token } },
      { phone: { contains: token } },
      { operator: { is: { username: { contains: token } } } },
      { operator: { is: { name: { contains: token } } } },
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
