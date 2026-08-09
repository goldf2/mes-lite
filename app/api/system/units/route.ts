import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import {
  unitFieldsSchema,
  unitIdentitySchema,
  unitUpdateSchema,
} from '@/modules/configuration/contracts/unit-schema'
import { unitHttpError } from '@/modules/configuration/http/unit-http-errors'
import {
  createConfiguredUnit,
  deleteConfiguredUnit,
  updateConfiguredUnit,
} from '@/modules/configuration/server/unit-command-service'
import { listConfiguredUnits } from '@/modules/configuration/server/unit-query-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!await getCurrentOperator()) return NextResponse.json({ error: '未登录' }, { status: 401 })
    return NextResponse.json({ data: await listConfiguredUnits() })
  } catch (error) {
    return unitHttpError(error, '获取单位配置失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const saved = await createConfiguredUnit(unitFieldsSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE_UNIT', entityType: 'SYSTEM_SETTING',
      entityLabel: `${saved.measureType}:${saved.code}`, afterData: saved,
      note: `新增单位，1 ${saved.code} = ${saved.toBaseFactor} 基准单位`,
    })
    return NextResponse.json({ data: await listConfiguredUnits() }, { status: 201 })
  } catch (error) {
    return unitHttpError(error, '新增单位失败')
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const { before, saved, usageCount } = await updateConfiguredUnit(unitUpdateSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'UPDATE_UNIT', entityType: 'SYSTEM_SETTING',
      entityLabel: `${saved.measureType}:${saved.code}`, beforeData: before, afterData: saved,
      note: usageCount > 0 ? '已使用单位仅修改显示名称' : '修改自定义单位',
    })
    return NextResponse.json({ data: await listConfiguredUnits() })
  } catch (error) {
    return unitHttpError(error, '修改单位失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const params = new URL(req.url).searchParams
    const deleted = await deleteConfiguredUnit(unitIdentitySchema.parse({
      code: params.get('code'),
      measureType: params.get('measureType'),
    }))
    await writeAuditLog(req, {
      action: 'DELETE_UNIT', entityType: 'SYSTEM_SETTING',
      entityLabel: `${deleted.measureType}:${deleted.code}`, beforeData: deleted,
      note: '删除未使用的自定义单位',
    })
    return NextResponse.json({ data: await listConfiguredUnits() })
  } catch (error) {
    return unitHttpError(error, '删除单位失败')
  }
}
