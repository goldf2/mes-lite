import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { buildDailyProductionConsumption } from '@/lib/daily-production'
import {
  dailyProductionReportInclude,
  dailyProductionReportInputSchema,
  parseDailyProductionReportDate,
} from '@/lib/daily-production-request'
import { resolveInventoryLocation } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

async function nextReportNo(tx: Prisma.TransactionClient, date: Date) {
  const dateCode = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  const count = await tx.dailyProductionReport.count({
    where: { reportDate: { gte: start, lt: end } },
  })
  return `PR-${dateCode}-${String(count + 1).padStart(3, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim()
    const status = searchParams.get('status')?.trim()
    const where: any = {}
    if (status && status !== 'ALL') where.status = status
    if (keyword) {
      where.OR = [
        { reportNo: { contains: keyword } },
        { workers: { contains: keyword } },
        { note: { contains: keyword } },
        { finishedMaterial: { is: { code: { contains: keyword } } } },
        { finishedMaterial: { is: { name: { contains: keyword } } } },
      ]
    }

    const [reports, materials] = await Promise.all([
      prisma.dailyProductionReport.findMany({
        where,
        include: dailyProductionReportInclude,
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      prisma.material.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          spec: true,
          category: true,
          primaryMeasure: true,
          stockUnit: true,
          unit: true,
          customer: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
        take: 1000,
      }),
    ])
    const materialCodes = materials.flatMap((material) => [material.code, `MAT-${material.code}`])
    const compatibleProducts = materialCodes.length > 0
      ? await prisma.product.findMany({
          where: { sku: { in: materialCodes } },
          select: {
            sku: true,
            bom: {
              select: {
              id: true,
              version: true,
              isActive: true,
              outputQuantity: true,
              outputUnit: true,
                items: {
                  where: { itemType: 'MATERIAL', materialId: { not: null } },
                  select: {
                    id: true,
                    quantity: true,
                    unit: true,
                    wastageRate: true,
                    material: {
                      select: {
                        id: true,
                        code: true,
                        name: true,
                        spec: true,
                        primaryMeasure: true,
                        stockUnit: true,
                        unit: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : []
    const productBySku = new Map(compatibleProducts.map((product) => [product.sku, product]))
    const materialsWithBom = materials.map((material) => {
      const product = productBySku.get(material.code) || productBySku.get(`MAT-${material.code}`)
      return { ...material, bom: product?.bom || null }
    })

    return NextResponse.json({ data: reports, materials: materialsWithBom })
  } catch (error) {
    console.error('Get daily production reports error:', error)
    return NextResponse.json({ error: '获取生产日报失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'create')
    if (denied) return denied

    const input = dailyProductionReportInputSchema.parse(await req.json())
    const reportDate = parseDailyProductionReportDate(input.reportDate)
    const report = await prisma.$transaction(async (tx) => {
      const consumptionLocation = await resolveInventoryLocation(tx, input.consumptionLocationId)
      const outputLocation = await resolveInventoryLocation(tx, input.outputLocationId)
      const snapshot = await buildDailyProductionConsumption(tx, input.finishedMaterialId, input.outputQty, input.consumptions)
      const reportNo = await nextReportNo(tx, reportDate)
      return tx.dailyProductionReport.create({
        data: {
          reportNo,
          reportDate,
          finishedMaterialId: input.finishedMaterialId,
          consumptionLocationId: consumptionLocation.id,
          outputLocationId: outputLocation.id,
          outputQty: input.outputQty,
          workers: input.workers,
          note: input.note || null,
          bomId: snapshot.bom.id,
          bomVersion: snapshot.bom.version,
          consumptions: { create: snapshot.consumptions },
        },
        include: dailyProductionReportInclude,
      })
    })

    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: report.id,
      entityLabel: report.reportNo,
      afterData: report,
      note: '创建生产日报草稿及 BOM 耗料快照',
    })

    return NextResponse.json({ data: report, message: '生产日报草稿已创建' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Create daily production report error:', error)
    return NextResponse.json({ error: '创建生产日报失败' }, { status: 500 })
  }
}
