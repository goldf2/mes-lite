import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createSupplierSchema = z.object({
  code: z.string().min(1, '供应商编码必填'),
  name: z.string().min(1, '供应商名称必填'),
  contact: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
})

// GET: 供应商列表，支持 keyword 搜索
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')

    const where = keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { code: { contains: keyword } },
            { contact: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        }
      : {}

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: suppliers })
  } catch (error) {
    console.error('Get suppliers error:', error)
    return NextResponse.json({ error: '获取供应商列表失败' }, { status: 500 })
  }
}

// POST: 新增供应商
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code, name, contact, phone, address } = createSupplierSchema.parse(body)

    const existing = await prisma.supplier.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: '供应商编码已存在' }, { status: 400 })
    }

    const supplier = await prisma.supplier.create({
      data: { code, name, contact, phone, address },
    })

    return NextResponse.json({ data: supplier }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create supplier error:', error)
    return NextResponse.json({ error: '创建供应商失败' }, { status: 500 })
  }
}
