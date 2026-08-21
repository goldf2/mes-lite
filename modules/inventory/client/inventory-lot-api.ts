import type { InventoryLotTrace } from '../contracts/inventory-lot-trace'
import type { InventoryLotPanorama, InventoryLotSearchResult } from '../contracts/inventory-lot-panorama'
import type { ResourceSearchCondition } from '@/lib/resource-search'

export async function loadInventoryLotTrace(lotId: string) {
  const response = await fetch(`/api/inventory-lots/${encodeURIComponent(lotId)}/trace`)
  const payload = await response.json() as { data?: InventoryLotTrace; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '获取批次谱系失败')
  return payload.data
}

export async function searchInventoryLots(keyword: string, conditions: readonly ResourceSearchCondition[] = []) {
  const params = new URLSearchParams()
  if (keyword.trim()) params.set('keyword', keyword.trim())
  if (conditions.length) params.set('advanced', JSON.stringify(conditions.map(({ field, operator, value }) => ({ field, operator, value }))))
  const response = await fetch(`/api/inventory-lots?${params.toString()}`)
  const payload = await response.json() as { data?: InventoryLotSearchResult; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '搜索批次失败')
  return payload.data
}

export async function loadInventoryLotPanorama(lotId: string) {
  const response = await fetch(`/api/inventory-lots/${encodeURIComponent(lotId)}/panorama`)
  const payload = await response.json() as { data?: InventoryLotPanorama; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '获取批次追溯全景失败')
  return payload.data
}
