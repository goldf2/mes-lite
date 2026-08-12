import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { StockAdjustmentError } from '@/lib/stock-adjustment'
import { parseStockListQuery, stockAdjustmentSchema } from '@/modules/inventory/contracts/stock-route'
import { adjustStock, repairStockRecords } from '@/modules/inventory/server/stock-command-service'
import { StockIntegrityError } from '@/modules/inventory/server/stock-integrity-service'
import { listStocks } from '@/modules/inventory/server/stock-query-service'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const data = await listStocks(parseStockListQuery(new URL(req.url).searchParams))
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof StockIntegrityError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 409 })
    }
    console.error('Get stocks error:', error)
    return NextResponse.json({ error: '获取库存失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied
    const result = await repairStockRecords()
    await writeAuditLog(req, {
      action: 'REPAIR',
      entityType: 'STOCK',
      entityLabel: '库存余额补齐',
      afterData: result,
      note: '仅补齐缺失的 Material 物料 0 库存余额记录，不再为内部兼容 Product 创建平行库存',
    })
    return NextResponse.json({
      message: `库存余额已补齐：物料 ${result.materials.length} 条`,
      data: result,
    })
  } catch (error) {
    console.error('Repair stock records error:', error)
    return NextResponse.json({ error: '补齐库存余额失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied
    const input = stockAdjustmentSchema.parse(await req.json())
    const result = await adjustStock(input)
    await writeAuditLog(req, {
      action: 'ADJUST',
      entityType: 'STOCK',
      entityId: result.stock.id,
      entityLabel: result.stock.material?.code || result.stock.product?.sku || result.stock.id,
      beforeData: result.stock,
      afterData: {
        locationId: result.location.id,
        location: `${result.location.code} ${result.location.name}`,
        oldLocationQty: result.oldLocationQty,
        newLocationQty: result.newLocationQty,
        newQty: result.newQty,
        newValuationQty: result.newValuationQty,
        newTotalCost: result.newTotalCost,
        reason: input.reason,
        adjustedBy: input.adjustedBy,
      },
    })
    return NextResponse.json({ success: true, message: '存货调整完成' })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof StockAdjustmentError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: '存货调整失败' }, { status: 500 })
  }
}
