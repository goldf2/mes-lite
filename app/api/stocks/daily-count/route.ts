import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { StockAdjustmentError } from '@/lib/stock-adjustment'
import { dailyInventoryCountSchema } from '@/modules/inventory/contracts/stock-route'
import { reconcileDailyInventory } from '@/modules/inventory/server/stock-command-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const input = dailyInventoryCountSchema.parse(await req.json())
    const data = await reconcileDailyInventory(
      input,
      await loadEffectiveDataScope(operator),
      operatorDisplayName(operator),
      await getAuditContext(req),
    )
    const message = data.adjusted.length > 0
      ? `库存盘点已过账：调整 ${data.adjusted.length} 条，账实一致 ${data.unchangedCount} 条`
      : `本次 ${data.unchangedCount} 条物品账实一致，无需调整`
    return NextResponse.json({ success: true, message, data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof StockAdjustmentError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Daily inventory count error:', error)
    return NextResponse.json({ error: '库存盘点失败' }, { status: 500 })
  }
}
