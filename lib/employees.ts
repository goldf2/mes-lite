import { Prisma } from '@prisma/client'

const EMPLOYEE_CODE_PATTERN = /^EMP-(\d+)$/

export async function nextEmployeeCode(tx: Prisma.TransactionClient) {
  const employees = await tx.employee.findMany({
    where: { code: { startsWith: 'EMP-' } },
    select: { code: true },
  })
  const largestSequence = employees.reduce((largest, employee) => {
    const match = EMPLOYEE_CODE_PATTERN.exec(employee.code)
    if (!match) return largest
    return Math.max(largest, Number(match[1]))
  }, 0)
  return `EMP-${String(largestSequence + 1).padStart(6, '0')}`
}

export async function resolveActiveEmployees(
  tx: Prisma.TransactionClient,
  employeeIds: string[],
) {
  const uniqueIds = Array.from(new Set(employeeIds))
  if (uniqueIds.length === 0) throw new Error('请选择员工')
  const employees = await tx.employee.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, code: true, name: true, department: true },
  })
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]))
  const ordered = uniqueIds.flatMap((id) => {
    const employee = employeeById.get(id)
    return employee ? [employee] : []
  })
  if (ordered.length !== uniqueIds.length) throw new Error('所选员工不存在或已停用，请重新选择')
  return ordered
}

export function employeeNamesSnapshot(employees: Array<{ name: string }>) {
  return employees.map((employee) => employee.name).join('、')
}
