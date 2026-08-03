import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const employeeFields = z.object({
  code: z.string().trim().min(1, '员工编码必填').max(40, '员工编码不能超过 40 个字符'),
  name: z.string().trim().min(1, '员工姓名必填').max(80, '员工姓名不能超过 80 个字符'),
  department: z.string().trim().max(80, '部门不能超过 80 个字符').optional().nullable(),
  phone: z.string().trim().max(40, '联系电话不能超过 40 个字符').optional().nullable(),
  note: z.string().trim().max(500, '备注不能超过 500 个字符').optional().nullable(),
  isActive: z.boolean().optional(),
  operatorId: z.string().trim().optional().nullable(),
})

const employeeUpdateSchema = employeeFields.extend({ id: z.string().min(1, '员工 ID 必填') })

function normalizeCode(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

function employeeData(input: z.infer<typeof employeeFields>) {
  return {
    code: normalizeCode(input.code),
    name: input.name,
    department: input.department || null,
    phone: input.phone || null,
    note: input.note || null,
    isActive: input.isActive ?? true,
    operatorId: input.operatorId || null,
  }
}

async function listEmployees(keyword?: string, includeInactive = false) {
  const where: Prisma.EmployeeWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(keyword ? {
      OR: [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
        { department: { contains: keyword } },
        { phone: { contains: keyword } },
        { operator: { is: { username: { contains: keyword } } } },
        { operator: { is: { name: { contains: keyword } } } },
      ],
    } : {}),
  }
  return prisma.employee.findMany({
    where,
    include: {
      operator: { select: { id: true, username: true, name: true, role: true, status: true } },
    },
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
  })
}

async function listOperators() {
  return prisma.operator.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      employee: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { username: 'asc' }],
  })
}

async function ensureOperatorAvailable(
  tx: Prisma.TransactionClient,
  operatorId: string | null | undefined,
  employeeId?: string,
) {
  if (!operatorId) return
  const operator = await tx.operator.findUnique({
    where: { id: operatorId },
    select: { username: true, employee: { select: { id: true, code: true, name: true } } },
  })
  if (!operator) throw new Error('所选注册账号不存在，请重新选择')
  if (operator.employee && operator.employee.id !== employeeId) {
    throw new Error(`注册账号“${operator.username}”已绑定员工 ${operator.employee.code} · ${operator.employee.name}`)
  }
}

function employeeUniqueError(error: Prisma.PrismaClientKnownRequestError) {
  const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : []
  return target.includes('operatorId') ? '该注册账号已绑定其他员工' : '员工编码已存在'
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim() || undefined
    const includeInactive = searchParams.get('includeInactive') === '1'
    const [employees, operators] = await Promise.all([
      listEmployees(keyword, includeInactive),
      listOperators(),
    ])
    return NextResponse.json({ data: employees, operators })
  } catch (error) {
    console.error('Get employees error:', error)
    return NextResponse.json({ error: '获取员工资料失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied
    const input = employeeFields.parse(await req.json())
    const employee = await prisma.$transaction(async (tx) => {
      await ensureOperatorAvailable(tx, input.operatorId)
      return tx.employee.create({
        data: employeeData(input),
        include: { operator: { select: { id: true, username: true, name: true, role: true, status: true } } },
      })
    })
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      entityLabel: `${employee.code} ${employee.name}`,
      afterData: employee,
    })
    return NextResponse.json({ data: employee, message: '员工已新增' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: employeeUniqueError(error) }, { status: 409 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Create employee error:', error)
    return NextResponse.json({ error: '新增员工失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const input = employeeUpdateSchema.parse(await req.json())
    const before = await prisma.employee.findUnique({ where: { id: input.id } })
    if (!before) return NextResponse.json({ error: '员工不存在' }, { status: 404 })
    const employee = await prisma.$transaction(async (tx) => {
      await ensureOperatorAvailable(tx, input.operatorId, input.id)
      return tx.employee.update({
        where: { id: input.id },
        data: employeeData(input),
        include: { operator: { select: { id: true, username: true, name: true, role: true, status: true } } },
      })
    })
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      entityLabel: `${employee.code} ${employee.name}`,
      beforeData: before,
      afterData: employee,
      note: before.isActive !== employee.isActive ? (employee.isActive ? '重新启用员工' : '停用员工') : undefined,
    })
    return NextResponse.json({ data: employee, message: employee.isActive ? '员工资料已保存' : '员工已停用' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: employeeUniqueError(error) }, { status: 409 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Update employee error:', error)
    return NextResponse.json({ error: '保存员工资料失败' }, { status: 500 })
  }
}
