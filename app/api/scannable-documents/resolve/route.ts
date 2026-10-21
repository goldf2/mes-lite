import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { hasResourcePermission } from '@/lib/permissions'
import { WarehousePackageError } from '@/modules/inventory'
import { resolveScannableDocument } from '@/modules/business-documents/server/scannable-document-query-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(req: NextRequest) {
  try {
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const [canReadShipment, canReadStock] = await Promise.all([hasResourcePermission(operator, 'shipment', 'read'), hasResourcePermission(operator, 'stocks', 'read')])
    if (!canReadShipment && !canReadStock) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const code = new URL(req.url).searchParams.get('code') || ''
    const result = await resolveScannableDocument(code, await loadEffectiveDataScope(operator))
    if (!result) return NextResponse.json({ error: '未找到该编码对应的单据' }, { status: 404 })
    if (result.href.includes('page=warehousePackages') ? !canReadStock : !canReadShipment) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof WarehousePackageError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Resolve scannable document error:', error)
    return NextResponse.json({ error: '扫码单据查询失败' }, { status: 500 })
  }
}
