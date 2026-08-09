import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import {
  parseWorkInstructionListQuery,
  workInstructionInputSchema,
  workInstructionUpdateInputSchema,
} from '@/modules/documents/contracts/work-instruction-schema'
import {
  archiveWorkInstruction,
  createWorkInstruction,
  DocumentContentValidationError,
  updateWorkInstruction,
  WorkInstructionNotFoundError,
  WorkInstructionValidationError,
} from '@/modules/documents/server/work-instruction-command-service'
import { listWorkInstructions } from '@/modules/documents/server/work-instruction-query-service'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'read')
    if (denied) return denied
    const parsed = parseWorkInstructionListQuery(new URL(req.url).searchParams)
    if (!parsed.data) return NextResponse.json({ error: parsed.error }, { status: 400 })
    return NextResponse.json(await listWorkInstructions(parsed.data))
  } catch (error) {
    console.error('Get work instructions error:', error)
    return NextResponse.json({ error: '获取产品文档失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'create')
    if (denied) return denied
    const instruction = await createWorkInstruction(workInstructionInputSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'CREATE', entityType: 'WORK_INSTRUCTION', entityId: instruction.id, entityLabel: instruction.title, afterData: instruction })
    return NextResponse.json({ data: instruction }, { status: 201 })
  } catch (error) {
    return workInstructionError(error, 'create')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied
    const { before, instruction } = await updateWorkInstruction(workInstructionUpdateInputSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'UPDATE', entityType: 'WORK_INSTRUCTION', entityId: instruction.id, entityLabel: instruction.title, beforeData: before, afterData: instruction })
    return NextResponse.json({ data: instruction, message: '产品文档已更新' })
  } catch (error) {
    return workInstructionError(error, 'update')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'delete')
    if (denied) return denied
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少产品文档 ID' }, { status: 400 })
    const { before, instruction } = await archiveWorkInstruction(id)
    await writeAuditLog(req, { action: 'ARCHIVE', entityType: 'WORK_INSTRUCTION', entityId: instruction.id, entityLabel: before.title, beforeData: before, afterData: instruction })
    return NextResponse.json({ success: true, message: '文档已归档' })
  } catch (error) {
    return workInstructionError(error, 'archive')
  }
}

function workInstructionError(error: unknown, operation: 'create' | 'update' | 'archive') {
  if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  if (error instanceof DocumentContentValidationError || error instanceof WorkInstructionValidationError) return NextResponse.json({ error: error.message }, { status: 400 })
  if (error instanceof WorkInstructionNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
  const labels = { create: 'Create', update: 'Update', archive: 'Archive' }
  console.error(`${labels[operation]} work instruction error:`, error)
  return NextResponse.json({ error: operation === 'create' ? '创建产品文档失败' : operation === 'update' ? '更新产品文档失败' : '归档产品文档失败' }, { status: 500 })
}
