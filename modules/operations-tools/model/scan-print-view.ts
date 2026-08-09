import type { LabelData, ScanResult } from '../contracts/scan-print'

export const scanResultLabels: Record<ScanResult, string> = {
  MATCHED: '计数成功',
  UNKNOWN: '条码不匹配',
  OVER: '超过目标数量',
}

export const createDefaultLabelData = (): LabelData => ({
  title: 'MES-lite 标签',
  code: 'TEST-001',
  name: 'PC310T 打印校准',
  spec: '',
  quantity: 1,
  unit: '件',
  note: '扫码与标签业务联动将在后续阶段接入',
})

export function formatScanQuantity(value: number) {
  return Number(value || 0).toFixed(6).replace(/\.?0+$/, '')
}

export function createClientRequestId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}
