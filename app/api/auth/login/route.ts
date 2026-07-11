import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createOperatorSession, setSessionCookie, verifyPassword } from '@/lib/auth'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = loginSchema.parse(body)

    const operator = await prisma.operator.findUnique({ where: { username } })
    if (!operator || !verifyPassword(password, operator.passwordHash)) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 })
    }

    if (operator.status === 'PENDING') {
      return NextResponse.json({ error: '账号待审核，请联系管理员' }, { status: 403 })
    }
    if (operator.status === 'REJECTED') {
      return NextResponse.json({ error: '账号审核未通过' }, { status: 403 })
    }
    if (operator.status === 'DISABLED') {
      return NextResponse.json({ error: '账号已停用' }, { status: 403 })
    }

    const { token, expiresAt } = await createOperatorSession(operator.id)
    await prisma.operator.update({
      where: { id: operator.id },
      data: { lastLoginAt: new Date() },
    })

    const res = NextResponse.json({
      data: {
        id: operator.id,
        username: operator.username,
        name: operator.name,
        phone: operator.phone,
        role: operator.role,
        status: operator.status,
      },
      message: '登录成功',
    })
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Login operator error:', error)
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}
