import type { InventoryLotTrace } from '../contracts/inventory-lot-trace'

export async function loadInventoryLotTrace(lotId: string) {
  const response = await fetch(`/api/inventory-lots/${encodeURIComponent(lotId)}/trace`)
  const payload = await response.json() as { data?: InventoryLotTrace; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '获取批次谱系失败')
  return payload.data
}
