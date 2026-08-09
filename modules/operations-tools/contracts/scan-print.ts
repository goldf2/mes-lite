export type ScanResult = 'MATCHED' | 'UNKNOWN' | 'OVER'

export interface ScanEvent {
  id: string
  rawValue: string
  code: string
  quantity: number
  result: ScanResult
  createdAt: string
}

export interface ScanSession {
  id: string
  sessionNo: string
  name?: string | null
  expectedCode: string
  expectedQty: number
  countedQty: number
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED'
  scannerModel?: string | null
  createdAt: string
  events: ScanEvent[]
}

export interface LabelData {
  title: string
  code: string
  name: string
  spec: string
  quantity: number
  unit: string
  note: string
}

export interface CreateScanSessionInput {
  clientRequestId: string
  name?: string
  expectedCode: string
  expectedQty: number
  purpose: 'GENERAL_COUNT'
  referenceType: 'GENERAL'
  scannerModel: string
}

export interface RecordScanEventInput {
  clientEventId: string
  rawValue: string
  quantity: number
}

export interface CreateLabelPrintJobInput {
  clientRequestId: string
  templateType: 'GENERIC_LABEL'
  referenceType: 'GENERAL'
  referenceId: string
  copies: number
  printerIp?: string
  labelWidthMm: number
  labelHeightMm: number
  payload: Record<string, unknown>
}
