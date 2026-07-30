import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import {
  createDocumentCategory,
  deleteDocumentCategory,
  DocumentCategoryError,
  listDocumentCategories,
  updateDocumentCategory,
} from '@/lib/document-categories'

export const dynamic = 'force-dynamic'

const categorySchema = z.object({
  name: z.string().trim().min(1, '类别名称不能为空').max(40, '类别名称最多 40 个字符'),
  parentId: z.string().trim().min(1).nullable().optional(),
})

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof DocumentCategoryError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET() {
  try {
    const denied = await requireResourcePermission('workInstructions', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await listDocumentCategories(prisma) })
  } catch (error) {
    return errorResponse(error, '获取文档类别失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied
    const input = categorySchema.parse(await req.json())
    const category = await createDocumentCategory(prisma, input)
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'DOCUMENT_CATEGORY',
      entityId: category.id,
      entityLabel: category.parent ? `${category.parent.name} / ${category.name}` : category.name,
      afterData: category,
    })
    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    return errorResponse(error, '新增文档类别失败')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'update')
    if (denied) return denied
    const input = categorySchema.extend({ id: z.string().min(1) }).parse(await req.json())
    const before = await prisma.documentCategory.findUnique({ where: { id: input.id } })
    const category = await updateDocumentCategory(prisma, input)
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'DOCUMENT_CATEGORY',
      entityId: category.id,
      entityLabel: category.parent ? `${category.parent.name} / ${category.name}` : category.name,
      beforeData: before,
      afterData: category,
    })
    return NextResponse.json({ data: category })
  } catch (error) {
    return errorResponse(error, '更新文档类别失败')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('workInstructions', 'delete')
    if (denied) return denied
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少文档类别 ID' }, { status: 400 })
    const deleted = await deleteDocumentCategory(prisma, id)
    await writeAuditLog(req, {
      action: 'DELETE',
      entityType: 'DOCUMENT_CATEGORY',
      entityId: deleted.id,
      entityLabel: deleted.name,
      beforeData: deleted,
    })
    return NextResponse.json({ success: true, message: '文档类别已删除' })
  } catch (error) {
    return errorResponse(error, '删除文档类别失败')
  }
}
