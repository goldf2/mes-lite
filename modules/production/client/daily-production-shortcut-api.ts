import type { DailyProductionShortcutInput } from '../contracts/daily-production-shortcut-schema'

export interface DailyProductionBomItem {
  id: string
  quantity: number
  unit: string
  wastageRate: number
  material: {
    id: string
    code: string
    name: string
    spec?: string | null
    stockUnit: string
    unit: string
  } | null
}

export interface DailyProductionBomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
  isActive: boolean
  outputQuantity: number
  outputUnit: string
  items: DailyProductionBomItem[]
}

export interface DailyProductionMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  stockUnit: string
  unit: string
  boms: DailyProductionBomOption[]
}

export interface DailyProductionReportSummary {
  id: string
  reportNo: string
  reportDate: string
  outputQty: number
  status: string
  bomName: string
  bomVersion: string
  outputLocation?: { code: string; name: string } | null
  finishedMaterial: { code: string; name: string; stockUnit: string; unit: string }
  consumptions: Array<{ id: string; materialCode: string; materialName: string; actualQty: number; unit: string }>
  qualityInspection?: { id: string; inspectionNo: string; status: string; result: string } | null
}

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
