import type { StockMovementStatsQuery, StockMovementStatsWorkspace } from '../contracts/stock-movement-stats'

export async function loadStockMovementStats(query: StockMovementStatsQuery): Promise<StockMovementStatsWorkspace> {
  const params = new URLSearchParams()
  if (query.startDate) params.set('startDate', query.startDate)
  if (query.endDate) params.set('endDate', query.endDate)
  if (query.materialId) params.set('materialId', query.materialId)
  if (query.locationId) params.set('locationId', query.locationId)
  const response = await fetch(`/api/stats/inventory-movements?${params.toString()}`)
  const payload = await response.json() as { data?: StockMovementStatsWorkspace; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '获取数量变动统计失败')
  return payload.data
}
