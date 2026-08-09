import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { configurationOrderEntities, getConfigurationOrder, updateConfigurationOrder } from '@/modules/configuration/server'

const entitySchema = z.enum(configurationOrderEntities)
const saveSchema = z.object({ entity: entitySchema, orderedIds: z.array(z.string().min(1)).max(2000) })

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await getConfigurationOrder(entitySchema.parse(req.nextUrl.searchParams.get('entity'))) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '排序类型无效' }, { status: 400 })
    return NextResponse.json({ error: '获取手动顺序失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const input = saveSchema.parse(await req.json())
    const before = await getConfigurationOrder(input.entity)
    const data = await updateConfigurationOrder(input.entity, input.orderedIds)
    await writeAuditLog(req, {
      action: 'REORDER', entityType: 'CONFIGURATION_ORDER', entityLabel: input.entity,
      beforeData: before.map((item) => item.id), afterData: data.map((item) => item.id), note: '调整配置资料默认显示顺序',
    })
    return NextResponse.json({ data, message: '手动顺序已保存' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '排序参数无效' }, { status: 400 })
    if (error instanceof Error && error.message === '排序内容已变化，请刷新后重试') return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof Error && error.message === '单位只能在相同计量类别内排序') return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: '保存手动顺序失败' }, { status: 500 })
  }
}
