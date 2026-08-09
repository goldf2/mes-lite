import { Prisma } from '@prisma/client'
import { nextConfigurationSortOrder } from '@/lib/configuration-order'
import { prisma } from '@/lib/prisma'
import type { EmployeeFieldsInput, EmployeeUpdateInput } from '../contracts/employee-schema'
import { EmployeeConfigurationError } from '../domain/employee-errors'
import { employeeWriteData, nextEmployeeCodeFromExisting } from '../domain/employee-rules'
import { employeeWithOperator } from './employee-projection'

function employeeUniqueError(error: Prisma.PrismaClientKnownRequestError) {
  const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [String(error.meta?.target || '')]
  return target.some((item) => item.includes('operatorId'))
    ? '该注册账号已绑定其他员工'
    : '员工编码生成冲突，请重试'
}

async function runEmployeeCommand<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof EmployeeConfigurationError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new EmployeeConfigurationError(employeeUniqueError(error), 409)
    }
    throw error
  }
}

async function assertOperatorAvailable(
  tx: Prisma.TransactionClient,
  operatorId: string | null | undefined,
  employeeId?: string,
) {
  if (!operatorId) return
  const operator = await tx.operator.findUnique({
    where: { id: operatorId },
    select: { username: true, employee: { select: { id: true, code: true, name: true } } },
  })
  if (!operator) throw new EmployeeConfigurationError('所选注册账号不存在，请重新选择')
  if (operator.employee && operator.employee.id !== employeeId) {
    throw new EmployeeConfigurationError(`注册账号“${operator.username}”已绑定员工 ${operator.employee.code} · ${operator.employee.name}`)
  }
}

export async function createManagedEmployee(input: EmployeeFieldsInput) {
  return runEmployeeCommand(() => prisma.$transaction(async (tx) => {
    const data = employeeWriteData(input)
    await assertOperatorAvailable(tx, data.operatorId)
    const existingCodes = await tx.employee.findMany({
      where: { code: { startsWith: 'EMP-' } },
      select: { code: true },
    })
    return tx.employee.create({
      data: {
        code: nextEmployeeCodeFromExisting(existingCodes.map((employee) => employee.code)),
        ...data,
        sortOrder: await nextConfigurationSortOrder(tx, 'employees'),
      },
      include: employeeWithOperator,
    })
  }))
}

export async function updateManagedEmployee(input: EmployeeUpdateInput) {
  return runEmployeeCommand(() => prisma.$transaction(async (tx) => {
    const before = await tx.employee.findUnique({ where: { id: input.id } })
    if (!before) throw new EmployeeConfigurationError('员工不存在', 404)
    const data = employeeWriteData(input)
    await assertOperatorAvailable(tx, data.operatorId, input.id)
    const saved = await tx.employee.update({
      where: { id: input.id },
      data,
      include: employeeWithOperator,
    })
    return { before, saved }
  }))
}
