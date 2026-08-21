import type { StockMovementDirection, StockMovementQuery } from './stock-movement'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { stockMovementSearchFieldKeys } from '../model/inventory-search-fields'

function optionalValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || null
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function parseStockMovementQuery(searchParams: URLSearchParams): StockMovementQuery {
  const requestedDirection = optionalValue(searchParams, 'direction')
  const direction: StockMovementDirection = requestedDirection === 'in' || requestedDirection === 'out'
    ? requestedDirection
    : null
  const advanced = parseResourceSearchConditions(searchParams.get('advanced'), stockMovementSearchFieldKeys)
  if (advanced.error) throw new Error(advanced.error)
  return {
    keyword: searchParams.get('keyword')?.trim() || '',
    page: positiveInteger(searchParams.get('page'), 1),
    pageSize: Math.min(100, positiveInteger(searchParams.get('pageSize'), 20)),
    type: optionalValue(searchParams, 'type'),
    direction,
    objectCode: optionalValue(searchParams, 'objectCode'),
    objectName: optionalValue(searchParams, 'objectName'),
    locationId: optionalValue(searchParams, 'locationId'),
    refType: optionalValue(searchParams, 'refType'),
    refId: optionalValue(searchParams, 'refId'),
    operator: optionalValue(searchParams, 'operator'),
    note: optionalValue(searchParams, 'note'),
    createdDate: optionalValue(searchParams, 'createdDate'),
    advancedConditions: advanced.conditions || [],
  }
}
