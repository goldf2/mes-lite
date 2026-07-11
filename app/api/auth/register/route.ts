import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, '账号只能包含字母、数字、下划线和短横线'),
  password: z.string().min(6, '密码至少 6 位'),
  name: z.string().min(1, '姓名必填').max(50),
  phone: z.string().max(30).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = registerSchema.parse(body)

    const existing = await prisma.operator.findUnique({ where: { username: data.username } })
    if (existing) {
      return NextResponse.json({ error: '账号已存在' }, { status: 400 })
    }

    const operatorCount = await prisma.operator.count()
    const isFirstOperator = operatorCount === 0
    const operator = await prisma.operator.create({
      data: {
        username: data.username,
        passwordHash: hashPassword(data.password),
        name: data.name,
        phone: data.phone || undefined,
        role: isFirstOperator ? 'ADMIN' : 'OPERATOR',
        status: isFirstOperator ? 'ACTIVE' : 'PENDING',
        approvedAt: isFirstOperator ? new Date() : undefined,
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      data: operator,
      message: isFirstOperator ? '首位操作人员已自动设为管理员，请登录' : '注册已提交，请等待审核',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Register operator error:', error)
    return NextResponse.json({ error: '注册失败' }, { status: 500 })
  }
}
