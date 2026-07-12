import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const stepSchema = z.object({
  stepNo: z.number().int().positive('工序号必须大于 0'),
  name: z.string().min(1, '工序名称必填'),
  defaultTime: z.number().int().nonnegative().optional(),
  workstation: z.string().optional(),
  description: z.string().optional(),
})

const routeSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, '产品必填'),
  name: z.string().min(1, '工艺路线名称必填'),
  isDefault: z.boolean().optional(),
  steps: z.array(stepSchema).min(1, '至少需要一个工序'),
})

export async function GET() {
  try {
    const denied = await requireResourcePermission('system', 'read')
    if (denied) return denied

    const routes = await prisma.processRoute.findMany({
      include: {
        product: { select: { id: true, sku: true, name: true } },
        steps: { orderBy: { stepNo: 'asc' } },
      },
      orderBy: { product: { sku: 'asc' } },
    })

    return NextResponse.json({ data: routes })
  } catch (error) {
    console.error('Get process routes error:', error)
    return NextResponse.json({ error: '获取工艺路线失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'create')
    if (denied) return denied

    const body = await req.json()
    const data = routeSchema.parse(body)

    const product = await prisma.product.findUnique({ where: { id: data.productId } })
    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    const route = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.processRoute.updateMany({
          where: { productId: data.productId, isDefault: true },
          data: { isDefault: false },
        })
      }

      return tx.processRoute.create({
        data: {
          productId: data.productId,
          name: data.name,
          isDefault: Boolean(data.isDefault),
          steps: {
            create: data.steps.map((step) => ({
              stepNo: step.stepNo,
              name: step.name,
              defaultTime: step.defaultTime ?? null,
              workstation: step.workstation || null,
              description: step.description || null,
            })),
          },
        },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          steps: { orderBy: { stepNo: 'asc' } },
        },
      })
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'PROCESS_ROUTE',
      entityId: route.id,
      entityLabel: `${product.sku} ${route.name}`,
      afterData: route,
    })

    return NextResponse.json({ data: route }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Create process route error:', error)
    return NextResponse.json({ error: '创建工艺路线失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied

    const body = await req.json()
    const data = routeSchema.extend({ id: z.string().min(1, '缺少工艺路线 ID') }).parse(body)

    const current = await prisma.processRoute.findUnique({
      where: { id: data.id },
      include: { product: true, steps: true },
    })
    if (!current) {
      return NextResponse.json({ error: '工艺路线不存在' }, { status: 404 })
    }

    const product = await prisma.product.findUnique({ where: { id: data.productId } })
    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    const route = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.processRoute.updateMany({
          where: { productId: data.productId, isDefault: true, id: { not: data.id } },
          data: { isDefault: false },
        })
      }

      await tx.processStep.deleteMany({ where: { routeId: data.id } })

      return tx.processRoute.update({
        where: { id: data.id },
        data: {
          productId: data.productId,
          name: data.name,
          isDefault: Boolean(data.isDefault),
          steps: {
            create: data.steps.map((step) => ({
              stepNo: step.stepNo,
              name: step.name,
              defaultTime: step.defaultTime ?? null,
              workstation: step.workstation || null,
              description: step.description || null,
            })),
          },
        },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          steps: { orderBy: { stepNo: 'asc' } },
        },
      })
    })

    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'PROCESS_ROUTE',
      entityId: route.id,
      entityLabel: `${product.sku} ${route.name}`,
      beforeData: current,
      afterData: route,
    })

    return NextResponse.json({ data: route, message: '工艺路线已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Update process route error:', error)
    return NextResponse.json({ error: '更新工艺路线失败，请确认该工艺尚未产生派工或报工记录' }, { status: 500 })
  }
}
