import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  defaultWorkspaceLayout,
  normalizeWorkspaceFunctionKeys,
  workspaceModes,
} from '@/lib/workspace'

const preferenceSchema = z.object({
  mode: z.enum(workspaceModes),
  layout: z.array(z.string()).max(40),
  pinned: z.array(z.string()).max(40),
})

function parseStoredKeys(value: string | null | undefined) {
  try {
    return normalizeWorkspaceFunctionKeys(JSON.parse(value || '[]'))
  } catch {
    return []
  }
}

export async function GET() {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const [preference, usage] = await Promise.all([
    prisma.operatorWorkspacePreference.findUnique({ where: { operatorId: operator.id } }),
    prisma.operatorFunctionUsage.findMany({
      where: { operatorId: operator.id },
      orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
    }),
  ])

  return NextResponse.json({
    data: {
      mode: workspaceModes.includes(preference?.mode as (typeof workspaceModes)[number])
        ? preference?.mode
        : 'DEFAULT',
      layout: preference ? parseStoredKeys(preference.layoutJson) : defaultWorkspaceLayout,
      pinned: preference ? parseStoredKeys(preference.pinnedJson) : [],
      usage: usage.map((item) => ({
        functionKey: item.functionKey,
        useCount: item.useCount,
        lastUsedAt: item.lastUsedAt,
      })),
    },
  })
}

export async function PUT(req: Request) {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  try {
    const parsed = preferenceSchema.parse(await req.json())
    const layout = normalizeWorkspaceFunctionKeys(parsed.layout)
    const pinned = normalizeWorkspaceFunctionKeys(parsed.pinned)
    const saved = await prisma.operatorWorkspacePreference.upsert({
      where: { operatorId: operator.id },
      create: {
        operatorId: operator.id,
        mode: parsed.mode,
        layoutJson: JSON.stringify(layout),
        pinnedJson: JSON.stringify(pinned),
      },
      update: {
        mode: parsed.mode,
        layoutJson: JSON.stringify(layout),
        pinnedJson: JSON.stringify(pinned),
      },
    })

    return NextResponse.json({
      data: {
        mode: saved.mode,
        layout,
        pinned,
      },
      message: '工作台设置已保存',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '工作台设置不合法', details: error.issues }, { status: 400 })
    }
    console.error('Save workspace preference error:', error)
    return NextResponse.json({ error: '保存工作台设置失败' }, { status: 500 })
  }
}
