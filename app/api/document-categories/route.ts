import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import {
  documentCategoryFieldsSchema,
  documentCategoryIdSchema,
  documentCategoryUpdateSchema,
} from '@/modules/documents/contracts/document-category-schema'
import { documentCategoryLabel } from '@/modules/documents/domain/document-category-rules'
import { documentCategoryHttpError } from '@/modules/documents/http/document-category-http-errors'
import {
  createManagedDocumentCategory,
  deleteManagedDocumentCategory,
  updateManagedDocumentCategory,
} from '@/modules/documents/server/document-category-command-service'
import { listManagedDocumentCategories } from '@/modules/documents/server/document-category-query-service'

export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const denied = await requireResourcePermission('workInstructions', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await listManagedDocumentCategories() })
  } catch (error) {
    return documentCategoryHttpError(error, '获取文档类别失败')
  }
}
export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied
    const category = await createManagedDocumentCategory(documentCategoryFieldsSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'DOCUMENT_CATEGORY', entityId: category.id,
      entityLabel: documentCategoryLabel(category), afterData: category,
    })
    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    return documentCategoryHttpError(error, '新增文档类别失败')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied
    const { before, saved } = await updateManagedDocumentCategory(documentCategoryUpdateSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'DOCUMENT_CATEGORY', entityId: saved.id,
      entityLabel: documentCategoryLabel(saved), beforeData: before, afterData: saved,
    })
    return NextResponse.json({ data: saved })
  } catch (error) {
    return documentCategoryHttpError(error, '更新文档类别失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'delete')
    if (denied) return denied
    const deleted = await deleteManagedDocumentCategory(
      documentCategoryIdSchema.parse(new URL(req.url).searchParams.get('id')),
    )
    await writeAuditLog(req, {
      action: 'DELETE', entityType: 'DOCUMENT_CATEGORY', entityId: deleted.id,
      entityLabel: deleted.name, beforeData: deleted,
    })
    return NextResponse.json({ success: true, message: '文档类别已删除' })
  } catch (error) {
    return documentCategoryHttpError(error, '删除文档类别失败')
  }
}
