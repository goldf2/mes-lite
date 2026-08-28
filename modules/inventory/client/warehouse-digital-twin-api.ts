import type { WarehouseDigitalTwin } from '../model/warehouse-digital-twin'

export async function loadWarehouseDigitalTwin() {
  const response = await fetch('/api/stocks/warehouse-twin')
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '获取仓库数字孪生失败')
  return payload.data as WarehouseDigitalTwin
}
