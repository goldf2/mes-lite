import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { workspaceFunctionKeys } from '@/lib/workspace'

const usageSchema = z.object({
  functionKey: z.enum(workspaceFunctionKeys),
})

export async function POST(req: Request) {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  try {
    const { functionKey } = usageSchema.parse(await req.json())
    const now = new Date()
    const usage = await prisma.operatorFunctionUsage.upsert({
      where: { operatorId_functionKey: { operatorId: operator.id, functionKey } },
      create: {
        operatorId: operator.id,
        functionKey,
        useCount: 1,
        lastUsedAt: now,
      },
      update: {
        useCount: { increment: 1 },
        lastUsedAt: now,
      },
    })

    return NextResponse.json({
      data: {
        functionKey: usage.functionKey,
        useCount: usage.useCount,
        lastUsedAt: usage.lastUsedAt,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '功能标识不合法', details: error.issues }, { status: 400 })
    }
    console.error('Record workspace usage error:', error)
    return NextResponse.json({ error: '记录功能使用失败' }, { status: 500 })
  }
}
