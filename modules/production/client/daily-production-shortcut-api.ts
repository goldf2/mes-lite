import type { DailyProductionShortcutInput } from '../contracts/daily-production-shortcut-schema'
import type {
  DailyProductionMaterialOption,
  DailyProductionReportSummary,
} from '../contracts/daily-production-shortcut'

export type {
  DailyProductionBomItem,
  DailyProductionBomOption,
  DailyProductionMaterialOption,
  DailyProductionReportSummary,
} from '../contracts/daily-production-shortcut'

export async function loadDailyProductionShortcutWorkspace() {
  const response = await fetch('/api/daily-production-shortcut')
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '读取生产日报失败')
  return {
    materials: (Array.isArray(payload.materials) ? payload.materials : []) as DailyProductionMaterialOption[],
    reports: (Array.isArray(payload.data) ? payload.data : []) as DailyProductionReportSummary[],
  }
}

export async function submitDailyProductionShortcut(input: DailyProductionShortcutInput) {
  const response = await fetch('/api/daily-production-shortcut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await response.json()
  return {
    ok: response.ok,
    message: payload.message || payload.error || (response.ok ? '生产日报已过账' : '生产日报过账失败'),
  }
}
