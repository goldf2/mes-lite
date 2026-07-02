import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        unit: true,
      },
    })
    return NextResponse.json({ data: products })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: '获取产品列表失败' }, { status: 500 })
  }
}
