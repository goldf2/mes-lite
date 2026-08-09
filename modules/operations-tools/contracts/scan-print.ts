import { z } from 'zod'

export const createScanSessionSchema = z.object({
  clientRequestId: z.string().min(1).max(100),
  name: z.string().trim().max(100).optional(),
  expectedCode: z.string().min(1),
  expectedQty: z.number().finite().positive(),
  purpose: z.string().trim().max(50).default('GENERAL_COUNT'),
  referenceType: z.string().trim().max(50).default('GENERAL'),
  referenceId: z.string().trim().max(100).optional(),
  scannerModel: z.string().optional(),
})

export const recordScanEventSchema = z.object({
  clientEventId: z.string().min(1).max(100),
  rawValue: z.string().min(1),
  quantity: z.number().finite().positive().max(100000).default(1),
})

export const createLabelPrintJobSchema = z.object({
  clientRequestId: z.string().min(1).max(100),
  templateType: z.string().trim().max(50).default('GENERIC_LABEL'),
  referenceType: z.string().trim().max(50).default('GENERAL'),
  referenceId: z.string().trim().max(100).optional(),
  copies: z.number().int().min(1).max(100).default(1),
  printerIp: z.string().trim().optional(),
  labelWidthMm: z.number().finite().min(10).max(500).default(105),
  labelHeightMm: z.number().finite().min(10).max(500).default(70),
  payload: z.record(z.unknown()).optional(),
})

export type ParsedCreateScanSessionInput = z.infer<typeof createScanSessionSchema>
export type ParsedRecordScanEventInput = z.infer<typeof recordScanEventSchema>
export type ParsedCreateLabelPrintJobInput = z.infer<typeof createLabelPrintJobSchema>

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
