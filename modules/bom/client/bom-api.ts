import type { BomMaterialOption, MaterialBom } from '../contracts'

interface BomApiEnvelope<T> {
  data?: T
  error?: string
  message?: string
  products?: MaterialBom[]
  materialOptions?: BomMaterialOption[]
}

export interface SaveBomInput {
  productId: string
  bomId?: string
  createNew: boolean
  name: string
  purpose: 'PRODUCTION' | 'PACKAGING'
  isDefault: boolean
  isActive: boolean
  outputQuantity: number
  outputs: Array<{
    materialId?: string
    quantity: number
    entryUnit: string
    isPrimary: boolean
  }>
  items: Array<{
    materialId: string
    quantity: number
    entryUnit: string
    wastageRate: number
  }>
}

export class BomApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BomApiError'
  }
}

async function readBomResponse<T>(response: Response, fallbackMessage: string) {
  const body = await response.json().catch(() => ({})) as BomApiEnvelope<T>
  if (!response.ok) throw new BomApiError(body.error || fallbackMessage)
  return body
}

export async function listBoms() {
  const response = await fetch('/api/boms')
  const body = await readBomResponse<never>(response, '获取 BOM 关系失败')
  return {
    products: body.products || [],
    materialOptions: body.materialOptions || [],
  }
}

export async function saveBom(input: SaveBomInput) {
  const response = await fetch('/api/boms', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readBomResponse<{ id?: string }>(response, '保存 BOM 批次配方失败')
  return {
    id: body.data?.id,
    message: body.message || 'BOM 批次配方已保存',
  }
}
