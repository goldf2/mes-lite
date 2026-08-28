import { toCsv } from '@/lib/csv'

export type DataIntegrityExportIssue = {
  id: string
  type: string
  severity: 'BLOCKING' | 'WARNING' | 'INFO'
  title: string
  detail: string
  entityType: string
  entityId: string
  entityLabel: string
  currentValue?: string | null
  expectedValue?: string | null
  actions: Array<{ key: string; label: string }>
}

export type DataIntegrityExportReport = {
  checkedAt: string
  issues: DataIntegrityExportIssue[]
}

const severityLabels: Record<DataIntegrityExportIssue['severity'], string> = {
  BLOCKING: '阻塞',
  WARNING: '警告',
  INFO: '提示',
}

function spreadsheetSafe(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function checkedAtLabel(checkedAt: string) {
  const date = new Date(checkedAt)
  return Number.isNaN(date.getTime()) ? checkedAt : date.toLocaleString('zh-CN')
}

export function buildDataIntegrityFaultCsv(report: DataIntegrityExportReport) {
  const rows: unknown[][] = [[
    '序号',
    '检查时间',
    '严重程度',
    '故障ID',
    '故障类型',
    '问题标题',
    '对象类型',
    '对象ID',
    '对象说明',
    '当前值',
    '期望值',
    '可执行操作',
    '详细说明',
  ]]
  const checkedAt = checkedAtLabel(report.checkedAt)

  report.issues.forEach((issue, index) => {
    rows.push([
      index + 1,
      spreadsheetSafe(checkedAt),
      severityLabels[issue.severity],
      spreadsheetSafe(issue.id),
      spreadsheetSafe(issue.type),
      spreadsheetSafe(issue.title),
      spreadsheetSafe(issue.entityType),
      spreadsheetSafe(issue.entityId),
      spreadsheetSafe(issue.entityLabel),
      spreadsheetSafe(issue.currentValue),
      spreadsheetSafe(issue.expectedValue),
      spreadsheetSafe(issue.actions.map((action) => `${action.label} (${action.key})`).join('；')),
      spreadsheetSafe(issue.detail),
    ])
  })

  return `\uFEFF${toCsv(rows)}`
}

export function dataIntegrityFaultFilename(checkedAt: string) {
  const parsed = new Date(checkedAt)
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const pad = (value: number) => String(value).padStart(2, '0')
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
  return `MES-lite-数据故障明细-${timestamp}.csv`
}
