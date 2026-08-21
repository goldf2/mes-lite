import { z } from 'zod'
import { parseCsvFilter } from '@/lib/status-filter'
import { parseResourceSearchConditions, type ResourceSearchCondition } from '@/lib/resource-search'
import { stockSearchFieldKeys } from '../model/inventory-search-fields'

export interface StockListQuery {
  type: 'material' | 'product' | null
  keyword: string
  category: string | null
  categories: string[]
  customerId: string | null
  locationId: string | null
  includeInvalid: boolean
  advancedConditions?: ResourceSearchCondition[]
}

export function parseStockListQuery(searchParams: URLSearchParams): StockListQuery {
  const requestedType = searchParams.get('type')
  const advanced = parseResourceSearchConditions(searchParams.get('advanced'), stockSearchFieldKeys)
  if (advanced.error) throw new Error(advanced.error)
  return {
    type: requestedType === 'material' || requestedType === 'product' ? requestedType : null,
    keyword: searchParams.get('keyword') || '',
    category: searchParams.get('category'),
    categories: parseCsvFilter(searchParams.get('categories')),
    customerId: searchParams.get('customerId'),
    locationId: searchParams.get('locationId'),
    includeInvalid: searchParams.get('includeInvalid') === '1',
    advancedConditions: advanced.conditions || [],
  }
}

export const stockAdjustmentSchema = z.object({
  stockId: z.string().min(1),
  locationId: z.string().min(1, '库位必填'),
  newLocationQty: z.number().nonnegative(),
  newValuationQty: z.number().nonnegative().optional(),
  newTotalCost: z.number().nonnegative().optional(),
  reason: z.string().min(1, '调整原因必填'),
}).strict()

export type StockAdjustmentCommand = z.infer<typeof stockAdjustmentSchema>
