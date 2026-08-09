import type { DashboardData } from '../contracts/dashboard'

export async function loadDashboard() {
  const response = await fetch('/api/stats/dashboard')
  const payload = await response.json() as { data?: DashboardData; error?: string }
  if (!response.ok) throw new Error(payload.error || '获取仪表盘数据失败')
  return payload.data || {}
}
