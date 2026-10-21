import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { DataScopeError, loadEffectiveDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { WarehousePackageError } from '../domain/warehouse-package'

export async function warehousePackageRoute(
  req: NextRequest,
  permission: 'read' | 'update' | 'ship' | 'print',
  operation: (context: { actorName: string; scope: EffectiveDataScope }) => Promise<NextResponse>,
) {
  try {
    const createDenied = permission === 'ship' ? await requireResourcePermission('shipment', 'create') : null
    const denied = permission === 'ship'
      ? (createDenied ? await requireResourcePermission('shipment', 'update') : null)
      : await requireResourcePermission('stocks', permission === 'update' ? 'update' : 'read')
    if (denied) return denied
    if (permission === 'print') { const printDenied = await requireResourcePermission('scanPrint', 'create'); if (printDenied) return printDenied }
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    return await operation({ actorName: operatorDisplayName(operator), scope: await loadEffectiveDataScope(operator) })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.errors[0]?.message || '装箱参数错误' }, { status: 400 })
    if (error instanceof DataScopeError || error instanceof WarehousePackageError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Warehouse package request failed:', req.method, error)
    return NextResponse.json({ error: '装箱操作失败，请刷新后重试' }, { status: 500 })
  }
}
