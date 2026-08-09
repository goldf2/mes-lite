import { z } from 'zod'
import { parseCsvFilter } from '@/lib/status-filter'

export interface StockListQuery {
  type: 'material' | 'product' | null
  keyword: string
  category: string | null
  categories: string[]
  customerId: string | null
  locationId: string | null
  includeInvalid: boolean
}

export function parseStockListQuery(searchParams: URLSearchParams): StockListQuery {
  const requestedType = searchParams.get('type')
  return {
    type: requestedType === 'material' || requestedType === 'product' ? requestedType : null,
    keyword: searchParams.get('keyword') || '',
    category: searchParams.get('category'),
    categories: parseCsvFilter(searchParams.get('categories')),
    customerId: searchParams.get('customerId'),
    locationId: searchParams.get('locationId'),
    includeInvalid: searchParams.get('includeInvalid') === '1',
  }
}

export const stockAdjustmentSchema = z.object({
  stockId: z.string().min(1),
  locationId: z.string().min(1, '库位必填'),
  newLocationQty: z.number().nonnegative(),
  newValuationQty: z.number().nonnegative().optional(),
  newTotalCost: z.number().nonnegative().optional(),
  reason: z.string().min(1, '调整原因必填'),
  adjustedBy: z.string().min(1),
})

export type StockAdjustmentCommand = z.infer<typeof stockAdjustmentSchema>
