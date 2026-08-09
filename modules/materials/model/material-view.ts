import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Material } from '../contracts'

export const materialSortOptions = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'code', label: '物料编码' },
  { value: 'name', label: '物料名称' },
  { value: 'category', label: '物料分类' },
  { value: 'customer', label: '归属客户' },
  { value: 'spec', label: '规格' },
  { value: 'note', label: '备注' },
  { value: 'stockUnit', label: '库存单位' },
  { value: 'valuationUnit', label: '参考/计价单位' },
  { value: 'costingMethod', label: '成本方法' },
  { value: 'stock', label: '库存数量' },
  { value: 'valuationStock', label: '参考数量' },
  { value: 'bomSummary', label: 'BOM 简况' },
] as const

export type MaterialSortBy = (typeof materialSortOptions)[number]['value']
export type SortDirection = 'asc' | 'desc'

export const materialVisibleFieldOptions = [
  { key: 'image', label: '图片' },
  { key: 'code', label: '编码' },
  { key: 'category', label: '分类' },
  { key: 'customer', label: '客户' },
  { key: 'spec', label: '规格' },
  { key: 'note', label: '备注' },
  { key: 'stockUnit', label: '库存单位' },
  { key: 'valuationUnit', label: '参考/计价单位' },
  { key: 'stock', label: '库存' },
  { key: 'valuationStock', label: '参考数量' },
  { key: 'createdAt', label: '创建时间' },
] as const

export type MaterialVisibleField = (typeof materialVisibleFieldOptions)[number]['key']
export type MaterialTableColumnKey = MaterialVisibleField | 'name' | 'bomSummary' | 'actions'
export type MaterialColumnWidths = Partial<Record<MaterialTableColumnKey, number>>

export const materialColumnMinWidths: Record<MaterialTableColumnKey, number> = {
  image: 72,
  code: 112,
  name: 112,
  category: 80,
  customer: 112,
  spec: 96,
  note: 144,
  stockUnit: 88,
  valuationUnit: 160,
  stock: 96,
  valuationStock: 96,
  createdAt: 128,
  bomSummary: 176,
  actions: 232,
}

export const bomSummaryFieldOptions = [
  { key: 'name', label: '物料名称' },
  { key: 'spec', label: '规格' },
  { key: 'code', label: '编码' },
] as const

export type BomSummaryField = (typeof bomSummaryFieldOptions)[number]['key']
export const defaultBomSummaryFields: BomSummaryField[] = ['name', 'spec']

export const defaultMaterialVisibleFields: MaterialVisibleField[] = [
  'image',
  'code',
  'category',
  'customer',
  'spec',
  'stockUnit',
  'valuationUnit',
  'stock',
  'valuationStock',
  'createdAt',
]

export interface MaterialBomSummary {
  count: number
  componentCount: number
  usageCount: number
  text: string
}

export interface MaterialCollectionActions {
  onCreateBom: (materialId: string) => void
  onOpenPanorama: (material: Material) => void
  onViewDetail: (material: Material) => void
  onArchive: (materialId: string) => void
}

export interface MaterialColumnControls {
  styleFor: (column: MaterialTableColumnKey) => CSSProperties | undefined
  onResize: (column: MaterialTableColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => void
  onReset: (column: MaterialTableColumnKey) => void
  onNudge: (column: MaterialTableColumnKey, delta: number) => void
}
