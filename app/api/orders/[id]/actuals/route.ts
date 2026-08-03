import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { employeeNamesSnapshot, resolveActiveEmployees } from '@/lib/employees'
import { buildProductionOrderActualLines, parseProductionOrderBomSnapshot } from '@/lib/production-order-actual'

const actualInputSchema = z.object({
  materialId: z.string().min(1),
  locationId: z.string().min(1, '请选择投入来源库位'),
  lossMode: z.enum(['FIXED_PER_UNIT', 'PERCENT']).default('PERCENT'),
  lossValue: z.number().finite().nonnegative(),
  actualQty: z.number().finite().positive().optional(),
})

const actualOutputSchema = z.object({
  materialId: z.string().min(1),
  locationId: z.string().min(1, '请选择产出入库库位'),
  actualQty: z.number().finite().nonnegative(),
})

const createActualSchema = z.object({
  actualDate: z.string().min(1, '生产日期必填'),
  employeeIds: z.array(z.string().min(1)).min(1, '请选择生产员工').max(50),
  note: z.string().trim().optional(),
  inputs: z.array(actualInputSchema).min(1, '请填写投入实绩').max(200),
  outputs: z.array(actualOutputSchema).min(1, '请填写产出实绩').max(50),
})

const actualInclude = {
  employees: {
    include: { employee: { select: { id: true, code: true, name: true, department: true, isActive: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  inputs: {
    include: {
      material: { select: { id: true, code: true, name: true, category: true, stockUnit: true, unit: true } },
      location: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  outputs: {
    include: {
      material: { select: { id: true, code: true, name: true, category: true, stockUnit: true, unit: true } },
      location: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.ProductionOrderActualInclude

function parseDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('生产日期格式不正确')
  return date
}

async function nextActualNo(tx: Prisma.TransactionClient, date: Date) {
  const dateCode = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  const count = await tx.productionOrderActual.count({ where: { actualDate: { gte: start, lt: end } } })
  return `PA-${dateCode}-${String(count + 1).padStart(3, '0')}`
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied

    const [order, locations, employees] = await Promise.all([
      prisma.productionOrder.findFirst({
        where: { id: params.id, deletedAt: null },
        include: {
          targetMaterial: { select: { id: true, code: true, name: true, stockUnit: true, unit: true } },
          actuals: { include: actualInclude, orderBy: [{ actualDate: 'desc' }, { createdAt: 'desc' }] },
        },
      }),
      prisma.inventoryLocation.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, code: true, name: true, isDefault: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, department: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
    ])
    if (!order) return NextResponse.json({ error: '生产订单不存在或已归档' }, { status: 404 })

    return NextResponse.json({
      data: {
        order: { ...order, bomSnapshot: order.bomSnapshot ? parseProductionOrderBomSnapshot(order.bomSnapshot) : null },
        locations,
        employees,
      },
    })
  } catch (error) {
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '获取生产订单实绩失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const input = createActualSchema.parse(await req.json())
    const actualDate = parseDate(input.actualDate)
    const actual = await prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.findFirst({ where: { id: params.id, deletedAt: null } })
      if (!order) throw new Error('生产订单不存在或已归档')
      if (['CANCELLED', 'COMPLETED'].includes(order.status)) throw new Error('已取消或已完成的生产订单不能新增实绩')
      if (!order.bomSnapshot) throw new Error('生产订单没有 BOM 快照，请重新创建生产订单')

      const employees = await resolveActiveEmployees(tx, input.employeeIds)
      const lines = await buildProductionOrderActualLines(tx, order.bomSnapshot, input.inputs, input.outputs)
      const actualNo = await nextActualNo(tx, actualDate)
      return tx.productionOrderActual.create({
        data: {
          actualNo,
          orderId: order.id,
          actualDate,
          workers: employeeNamesSnapshot(employees),
          note: input.note || null,
          employees: {
            create: employees.map((employee) => ({
              employeeId: employee.id,
              employeeCode: employee.code,
              employeeName: employee.name,
            })),
          },
          inputs: { create: lines.inputs },
          outputs: { create: lines.outputs },
        },
        include: actualInclude,
      })
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'PRODUCTION_ORDER_ACTUAL',
      entityId: actual.id,
      entityLabel: actual.actualNo,
      afterData: actual,
      note: '保存班后生产实绩草稿及订单 BOM 快照换算结果',
    })
    return NextResponse.json({ data: actual, message: '班后生产实绩草稿已保存' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '保存班后生产实绩失败' }, { status: 500 })
  }
}
