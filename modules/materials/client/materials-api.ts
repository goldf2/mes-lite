import type { ConfiguredUnit, CustomerOption, Material, MeasureType, PaginationState } from '../contracts'
import type { AttachmentItem, PanoramaData } from '../contracts/material-panorama'
import { setAttachmentRotation } from '@/modules/attachments'

interface ApiEnvelope<T> {
  data?: T
  error?: string
  message?: string
  details?: string[]
  pagination?: PaginationState
}

export interface MaterialUpsertInput {
  code: string
  name: string
  spec: string
  note: string
  category: string
  customerId?: string
  primaryMeasure: MeasureType
  referenceMeasure?: MeasureType
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  conversionNote?: string
  costingMethod: string
  defaultSalePrice: number | null
  salesCurrency: string
}

export interface MaterialImportSummary {
  total?: number
  created?: number
  updated?: number
  skipped?: number
  customersCreated?: number
}

export class MaterialApiError extends Error {
  details: string[]

  constructor(message: string, details: string[] = []) {
    super(message)
    this.name = 'MaterialApiError'
    this.details = details
  }
}

async function readApiEnvelope<T>(response: Response, fallbackMessage: string): Promise<ApiEnvelope<T>> {
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>
  if (!response.ok) throw new MaterialApiError(body.error || fallbackMessage, body.details)
  return body
}

export async function listMaterials(params: URLSearchParams) {
  const query = params.toString()
  const response = await fetch(query ? `/api/materials?${query}` : '/api/materials')
  const body = await readApiEnvelope<Material[]>(response, '获取物料失败')
  const materials = body.data || []
  return {
    materials,
    pagination: body.pagination,
  }
}

export async function listMaterialCustomers() {
  const response = await fetch('/api/customers')
  const body = await readApiEnvelope<CustomerOption[]>(response, '获取客户失败')
  return body.data || []
}

export async function listConfiguredUnits() {
  const response = await fetch('/api/system/units')
  const body = await readApiEnvelope<ConfiguredUnit[]>(response, '获取单位配置失败')
  return body.data || []
}

export async function saveMaterial(input: MaterialUpsertInput, materialId?: string) {
  const response = await fetch('/api/materials', {
    method: materialId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(materialId ? { ...input, id: materialId } : input),
  })
  const body = await readApiEnvelope<Material>(response, materialId ? '更新失败' : '创建失败')
  return body.data
}

export async function archiveMaterial(materialId: string) {
  const response = await fetch(`/api/materials/${materialId}/archive`, { method: 'PATCH' })
  const body = await readApiEnvelope<never>(response, '归档失败')
  return body.message || '归档成功'
}

export async function importMaterials(file: File, mode: 'skip' | 'update') {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`/api/materials/import?mode=${mode}`, {
    method: 'POST',
    body: formData,
  })
  const body = await readApiEnvelope<MaterialImportSummary>(response, '导入失败')
  return body.data || {}
}

export async function findMaterialByCode(code: string, materialId: string) {
  const params = new URLSearchParams({ keyword: code, pageSize: '20' })
  const { materials } = await listMaterials(params)
  return materials.find((material) => material.id === materialId) || null
}

export async function getMaterialPanorama(materialId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/materials/${materialId}/panorama`, { signal })
  const body = await readApiEnvelope<PanoramaData>(response, '获取物料全景失败')
  if (!body.data) throw new MaterialApiError('物料全景数据为空')
  return body.data
}

export async function saveAttachmentRotation(id: string, rotation: number) {
  return setAttachmentRotation<AttachmentItem>(id, rotation)
}

export async function downloadMaterialFile(url: string, fallbackFilename = 'materials.csv') {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiEnvelope<never>
    throw new MaterialApiError(body.error || '下载失败')
  }

  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const disposition = response.headers.get('Content-Disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackFilename
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
