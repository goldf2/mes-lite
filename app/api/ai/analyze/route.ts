import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { openai } = await import('@ai-sdk/openai')
    const { streamText } = await import('ai')

    const { orderId } = await req.json()

    if (!orderId) {
      return NextResponse.json({ error: '缺少 orderId' }, { status: 400 })
    }

    // 查询工单 + 报工 + 质检数据
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        product: true,
        reports: { include: { step: true } },
        qcRecords: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    // 构建 AI 分析提示
    const totalGood = order.reports.reduce((sum, r) => sum + r.goodQty, 0)
    const totalBad = order.reports.reduce((sum, r) => sum + r.badQty, 0)
    const badRates = order.reports
      .filter(r => r.badQty > 0)
      .map(r => ({
        step: r.step.name,
        badQty: r.badQty,
        reason: r.badReason,
      }))

    const prompt = `你是一位工厂生产质量分析师。请分析以下工单数据，给出简洁的中文总结（不超过 200 字）：

产品：${order.product.name}
计划数量：${order.planQty}
工单状态：${order.status}

工序报工汇总：
${order.reports.map(r => `- ${r.step.name}: 合格 ${r.goodQty}, 不良 ${r.badQty}${r.badReason ? ', 原因: ' + r.badReason : ''}`).join('\n')}

不良汇总：
${totalBad > 0 ? badRates.map(b => `- ${b.step}: ${b.badQty} 件, 原因 ${b.reason || '未记录'}`).join('\n') : '无不良记录'}

请给出：1. 整体质量评价；2. 主要问题（如有）；3. 改进建议。`

    const result = streamText({
      model: openai('gpt-4o-mini'),
      prompt,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('AI analyze error:', error)
    return NextResponse.json({ error: 'AI 分析失败' }, { status: 500 })
  }
}
