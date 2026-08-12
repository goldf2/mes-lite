import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { BomDomainError } from '@/modules/bom/domain/bom-errors'
import { copyBomVersion } from '@/modules/bom/server/bom-lifecycle-service'

const copySchema = z.object({ changeReason: z.string().trim().max(500).optional() })

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('bomCost', 'create')
    if (denied) return denied
    const input = copySchema.parse(await req.json().catch(() => ({})))
    const saved = await copyBomVersion(params.id, input.changeReason)
    await writeAuditLog(req, {
      action: 'COPY_VERSION', entityType: 'BOM', entityId: saved.id,
      entityLabel: `${saved.name} ${saved.version}`, afterData: saved, note: input.changeReason,
    })
    return NextResponse.json({ data: saved, message: `已创建草稿版本 ${saved.version}` }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof BomDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '同一产品的 BOM 版本号不能重复，请重试' }, { status: 409 })
    }
    console.error('Copy BOM error:', error)
    return NextResponse.json({ error: '创建 BOM 新版本失败' }, { status: 500 })
  }
}
