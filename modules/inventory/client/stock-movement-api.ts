import type { StockMovementQuery, StockMovementWorkspace } from '../contracts/stock-movement'

export type StockMovementRequest = Omit<StockMovementQuery, 'type' | 'direction' | 'objectCode' | 'objectName' | 'locationId' | 'refType' | 'refId' | 'operator' | 'note' | 'createdDate'> & {
  type: string
  direction: string
  objectCode: string
  objectName: string
  locationId: string
  refType: string
  refId: string
  operator: string
  note: string
  createdDate: string
  advancedConditions: import('@/lib/resource-search').ResourceSearchCondition[]
}

export async function loadStockMovements(query: StockMovementRequest): Promise<StockMovementWorkspace> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  })
  for (const [key, value] of Object.entries(query)) {
    if (key === 'page' || key === 'pageSize' || !String(value).trim()) continue
    params.set(key === 'advancedConditions' ? 'advanced' : key, key === 'advancedConditions' ? JSON.stringify(value) : String(value).trim())
  }
  const response = await fetch(`/api/stock-movements?${params.toString()}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '获取库存流水失败')
  return payload as StockMovementWorkspace
}
