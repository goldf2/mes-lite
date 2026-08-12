import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { saveBomSchema } from '@/modules/bom/contracts/bom-schema'
import { BomDomainError } from '@/modules/bom/domain/bom-errors'
import { saveBom } from '@/modules/bom/server/bom-command-service'
import { listBoms } from '@/modules/bom/server/bom-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('bomCost', 'read')
    if (denied) return denied
    return NextResponse.json(await listBoms())
  } catch (error) {
    console.error('Get BOM error:', error)
    return NextResponse.json({ error: '获取 BOM 数据失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'update')
    if (denied) return denied
    const input = saveBomSchema.parse(await req.json())
    const { saved, product } = await saveBom(input)
    await writeAuditLog(req, {
      action: input.createNew ? 'CREATE' : 'UPDATE',
      entityType: 'BOM',
      entityId: saved?.id || product.id,
      entityLabel: `${product.sku} ${product.name} ${saved?.name || ''} ${saved?.version || ''}`.trim(),
      afterData: saved,
    })
    return NextResponse.json({ data: saved, message: input.createNew ? 'BOM 方案已创建' : 'BOM 方案已保存' })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof BomDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '同一产品的 BOM 版本号不能重复' }, { status: 409 })
    }
    if (error instanceof Error && /BOM 数量|所选单位|必须使用主库存单位|无法换算|换算后的 BOM/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Save BOM error:', error)
    return NextResponse.json({ error: '保存 BOM 方案失败' }, { status: 500 })
  }
}
