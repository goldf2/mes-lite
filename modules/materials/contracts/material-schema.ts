import { z } from 'zod'
import { parseCsvFilter } from '@/lib/status-filter'
import { materialSearchFieldKeys } from '../model/material-search-fields'

export const materialCategories = ['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER'] as const
export const materialMeasures = ['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER'] as const
export const materialSortFields = ['createdAt', 'code', 'name', 'category', 'customer', 'spec', 'note', 'stockUnit', 'valuationUnit', 'costingMethod', 'stock', 'valuationStock', 'bomSummary'] as const

export const materialInputSchema = z.object({
  code: z.string().min(1, '物料编码不能为空'),
  name: z.string().min(1, '物料名称不能为空'),
  spec: z.string().optional(),
  note: z.string().optional(),
  category: z.enum(materialCategories).optional(),
  customerId: z.string().optional(),
  primaryMeasure: z.enum(materialMeasures).optional(),
  referenceMeasure: z.enum(materialMeasures).optional(),
  unit: z.string().min(1, '单位不能为空'),
  stockUnit: z.string().optional(),
  valuationUnit: z.string().optional(),
  conversionRate: z.number().positive().optional(),
  conversionNote: z.string().optional(),
  costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO']).optional(),
  defaultSalePrice: z.number().finite().nonnegative().nullable().optional(),
  salesCurrency: z.enum(['CNY']).optional(),
})

export const materialUpdateInputSchema = materialInputSchema.extend({ id: z.string().min(1, '缺少物料 ID') })

export const materialAdvancedConditionSchema = z.object({
  field: z.enum(materialSearchFieldKeys),
  operator: z.enum(['equals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte']),
  value: z.string().trim().min(1).max(200),
})

export type MaterialInput = z.infer<typeof materialInputSchema>
export type MaterialUpdateInput = z.infer<typeof materialUpdateInputSchema>
export type MaterialAdvancedCondition = z.infer<typeof materialAdvancedConditionSchema>
export type MaterialSortField = (typeof materialSortFields)[number]

export interface MaterialListQuery {
  keyword: string
  category: string | null
  categories: string[]
  customerId: string | null
  bomStatus: string | null
  advancedConditions: MaterialAdvancedCondition[]
  page: number
  pageSize: number
  sortBy: MaterialSortField
  sortDir: 'asc' | 'desc'
}

export function parseMaterialListQuery(searchParams: URLSearchParams): { data?: MaterialListQuery; error?: string } {
  let advancedConditions: MaterialAdvancedCondition[] = []
  const advanced = searchParams.get('advanced')
  if (advanced) {
    try {
      const result = z.array(materialAdvancedConditionSchema).max(30).safeParse(JSON.parse(advanced))
      if (!result.success) return { error: '高级搜索条件无效' }
      advancedConditions = result.data
    } catch {
      return { error: '高级搜索条件格式错误' }
    }
  }
  const rawPage = Number.parseInt(searchParams.get('page') || '1')
  const rawPageSize = Number.parseInt(searchParams.get('pageSize') || '20')
  const requestedSortBy = searchParams.get('sortBy') || 'createdAt'
  const sortBy = materialSortFields.includes(requestedSortBy as MaterialSortField)
    ? requestedSortBy as MaterialSortField
    : 'createdAt'
  return {
    data: {
      keyword: searchParams.get('keyword') || '',
      category: searchParams.get('category'),
      categories: parseCsvFilter(searchParams.get('categories')),
      customerId: searchParams.get('customerId'),
      bomStatus: searchParams.get('bomStatus'),
      advancedConditions,
      page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
      pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 200) : 20,
      sortBy,
      sortDir: searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc',
    },
  }
}

export function materialQueryNeedsBomPermission(query: MaterialListQuery) {
  return Boolean(query.bomStatus || query.sortBy === 'bomSummary' || query.advancedConditions.some((condition) => condition.field === 'bomStatus'))
}
