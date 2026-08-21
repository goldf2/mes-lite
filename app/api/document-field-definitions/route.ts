import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireAnyResourcePermission, requireResourcePermission } from '@/lib/permissions'
import { documentFieldCategoryIdSchema, documentFieldIdSchema, documentFieldInputSchema, documentFieldUpdateSchema } from '@/modules/documents/contracts/document-field-schema'
import { documentFieldHttpError } from '@/modules/documents/http/document-field-http-errors'
import { createDocumentFieldDefinition, deleteDocumentFieldDefinition, updateDocumentFieldDefinition } from '@/modules/documents/server/document-field-command-service'
import { listDocumentFieldDefinitions } from '@/modules/documents/server/document-field-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireAnyResourcePermission(['documentCategories', 'workInstructions'], 'read')
    if (denied) return denied
    const categoryIdParam = new URL(req.url).searchParams.get('categoryId')
    const categoryId = categoryIdParam ? documentFieldCategoryIdSchema.parse(categoryIdParam) : undefined
    return NextResponse.json({ data: await listDocumentFieldDefinitions(categoryId) })
  } catch (error) { return documentFieldHttpError(error, '获取扩展字段失败') }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('documentCategories', 'create')
    if (denied) return denied
    const field = await createDocumentFieldDefinition(documentFieldInputSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'CREATE', entityType: 'DOCUMENT_FIELD_DEFINITION', entityId: field.id, entityLabel: field.name, afterData: field })
    return NextResponse.json({ data: field }, { status: 201 })
  } catch (error) { return documentFieldHttpError(error, '新增扩展字段失败') }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('documentCategories', 'update')
    if (denied) return denied
    const { before, saved } = await updateDocumentFieldDefinition(documentFieldUpdateSchema.parse(await req.json()))
    await writeAuditLog(req, { action: 'UPDATE', entityType: 'DOCUMENT_FIELD_DEFINITION', entityId: saved.id, entityLabel: saved.name, beforeData: before, afterData: saved })
    return NextResponse.json({ data: saved })
  } catch (error) { return documentFieldHttpError(error, '更新扩展字段失败') }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('documentCategories', 'delete')
    if (denied) return denied
    const deleted = await deleteDocumentFieldDefinition(documentFieldIdSchema.parse(new URL(req.url).searchParams.get('id')))
    await writeAuditLog(req, { action: 'DELETE', entityType: 'DOCUMENT_FIELD_DEFINITION', entityId: deleted.id, entityLabel: deleted.name, beforeData: deleted })
    return NextResponse.json({ success: true, message: '扩展字段已删除' })
  } catch (error) { return documentFieldHttpError(error, '删除扩展字段失败') }
}
