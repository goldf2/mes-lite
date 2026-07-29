import { NextRequest, NextResponse } from 'next/server'
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = dailyProductionReportInputSchema.parse(await req.json())
    const existing = await prisma.dailyProductionReport.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: '生产日报不存在' }, { status: 404 })
    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: '只有草稿日报可以修改；已确认日报请先冲销' }, { status: 400 })
    }

    const totalProcessedQty = input.goodQty + input.badQty + input.scrapQty
    const report = await prisma.$transaction(async (tx) => {
      const snapshot = await buildDailyProductionConsumption(tx, input.finishedMaterialId, totalProcessedQty)
      await tx.dailyProductionConsumption.deleteMany({ where: { reportId: existing.id } })
      return tx.dailyProductionReport.update({
        where: { id: existing.id },
        data: {
          reportDate: parseDailyProductionReportDate(input.reportDate),
          finishedMaterialId: input.finishedMaterialId,
          goodQty: input.goodQty,
          badQty: input.badQty,
          scrapQty: input.scrapQty,
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
      action: 'UPDATE',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: report.id,
      entityLabel: report.reportNo,
      beforeData: existing,
      afterData: report,
    })
    return NextResponse.json({ data: report, message: '生产日报草稿已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Update daily production report error:', error)
    return NextResponse.json({ error: '更新生产日报失败' }, { status: 500 })
  }
}
