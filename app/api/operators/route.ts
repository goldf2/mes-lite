import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canManage, getCurrentOperator } from '@/lib/auth'
import { hasResourcePermission, requireResourcePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'DISABLED']).optional(),
  role: z.enum(['OPERATOR', 'AUDITOR', 'ADMIN']).optional(),
})

export async function GET() {
  const denied = await requireResourcePermission('operators', 'read')
  if (denied) return denied

  const operators = await prisma.operator.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      approvedAt: true,
      approvedBy: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ data: operators })
}

export async function PATCH(req: NextRequest) {
  const current = await getCurrentOperator()
  if (!current || !(await hasResourcePermission(current.role, 'operators', 'update'))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.role && !canManage(current.role)) {
      return NextResponse.json({ error: '只有管理员可以调整角色' }, { status: 403 })
    }

    if (data.id === current.id && data.status && data.status !== 'ACTIVE') {
      return NextResponse.json({ error: '不能停用或拒绝当前登录账号' }, { status: 400 })
    }

    const updateData: any = {}
    if (data.role) updateData.role = data.role
    if (data.status) {
      updateData.status = data.status
      if (data.status === 'ACTIVE') {
        updateData.approvedAt = new Date()
        updateData.approvedBy = current.id
      }
      if (data.status === 'REJECTED' || data.status === 'DISABLED') {
        await prisma.operatorSession.deleteMany({ where: { operatorId: data.id } })
      }
    }

    const operator = await prisma.operator.update({
      where: { id: data.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        approvedAt: true,
        approvedBy: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ data: operator, message: '操作人员已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update operator error:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
