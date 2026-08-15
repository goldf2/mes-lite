import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAuditContext, writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import {
  materialInputSchema,
  materialQueryNeedsBomPermission,
  materialUpdateInputSchema,
  parseMaterialListQuery,
} from '@/modules/materials/contracts/material-schema'
import {
  createMaterial,
  MaterialConflictError,
  MaterialInputError,
  MaterialNotFoundError,
  updateMaterial,
} from '@/modules/materials/server/material-command-service'
import { listMaterials } from '@/modules/materials/server/material-query-service'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied
    const parsed = parseMaterialListQuery(new URL(req.url).searchParams)
    if (!parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (materialQueryNeedsBomPermission(parsed.data)) {
      const bomDenied = await requireResourcePermission('bom', 'read')
      if (bomDenied) return bomDenied
    }
    return NextResponse.json(await listMaterials(parsed.data))
  } catch (error) {
    console.error('Get materials error:', error)
    return NextResponse.json({ error: '获取物料列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'create')
    if (denied) return denied
    const material = await createMaterial(materialInputSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'CREATE', entityType: 'MATERIAL', entityId: material.id, entityLabel: material.code, afterData: material })
    return NextResponse.json({ data: material }, { status: 201 })
  } catch (error) {
    return materialError(error, 'create')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('materials', 'update')
    if (denied) return denied
    const result = await updateMaterial(materialUpdateInputSchema.parse(await req.json()), () => getAuditContext(req))
    if (!result.unitsChanged) {
      await writeAuditLog(req, { action: 'UPDATE', entityType: 'MATERIAL', entityId: result.material.id, entityLabel: result.material.code, beforeData: result.before, afterData: result.material })
    }
    return NextResponse.json({ data: result.material })
  } catch (error) {
    return materialError(error, 'update')
  }
}

export async function DELETE() {
  // audit-exempt: 物料删除入口固定返回 405，实际归档使用独立已审计命令。
  return NextResponse.json({ error: '物料不允许删除，请使用归档' }, { status: 405 })
}

function materialError(error: unknown, operation: 'create' | 'update') {
  if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  if (error instanceof MaterialInputError || error instanceof MaterialConflictError) return NextResponse.json({ error: error.message }, { status: 400 })
  if (error instanceof MaterialNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
  console.error(`${operation === 'create' ? 'Create' : 'Update'} material error:`, error)
  return NextResponse.json({ error: operation === 'create' ? '创建物料失败' : '更新物料失败' }, { status: 500 })
}
