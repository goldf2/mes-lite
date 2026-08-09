import type { Prisma } from '@prisma/client'
import { EmployeeConfigurationError } from '../domain/employee-errors'

export async function resolveActiveEmployees(
  tx: Prisma.TransactionClient,
  employeeIds: string[],
) {
  const uniqueIds = Array.from(new Set(employeeIds))
  if (uniqueIds.length === 0) throw new EmployeeConfigurationError('请选择员工')
  const employees = await tx.employee.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, code: true, name: true, department: true },
  })
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]))
  const ordered = uniqueIds.flatMap((id) => {
    const employee = employeeById.get(id)
    return employee ? [employee] : []
  })
  if (ordered.length !== uniqueIds.length) {
    throw new EmployeeConfigurationError('所选员工不存在或已停用，请重新选择')
  }
  return ordered
}
