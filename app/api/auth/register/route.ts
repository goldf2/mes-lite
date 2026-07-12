import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'

const registerSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, '账号只能包含中文、字母、数字、下划线和短横线'),
  password: z.string().min(6, '密码至少 6 位'),
  name: z.string().trim().min(1, '姓名必填').max(50),
  phone: z.string().trim().max(30).optional(),
})

function getRegisterErrorMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return '账号已存在'
    if (error.code === 'P2021' || error.code === 'P2022') return '数据库结构未初始化，请先执行迁移'
    return `数据库操作失败（${error.code}）`
  }

  const message = error instanceof Error ? error.message : String(error)
  if (/readonly|read-only|permission denied|unable to open database file|attempt to write a readonly database/i.test(message)) {
    return '数据库不可写，请检查服务器持久化目录权限'
  }
  if (/no such table|no such column|table .* does not exist|column .* does not exist/i.test(message)) {
    return '数据库结构未初始化，请先执行迁移'
  }
  if (/database is locked|busy|timeout/i.test(message)) return '数据库正被占用，请稍后重试'
  if (/disk I\/O|no space left|database disk image is malformed/i.test(message)) {
    return '数据库文件或磁盘异常，请检查服务器存储'
  }

  const errorName = error instanceof Error ? error.name : 'UnknownError'
  return `注册失败：${errorName}，请查看服务器日志`
}

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
      const message = error.errors[0]?.message || '参数错误'
      return NextResponse.json({ error: message, details: error.errors }, { status: 400 })
    }
    console.error('Register operator error:', error)
    return NextResponse.json({ error: getRegisterErrorMessage(error) }, { status: 500 })
  }
}
