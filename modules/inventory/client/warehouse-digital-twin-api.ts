import { loadInventoryLocations, loadStocks } from './stock-api'
import { buildWarehouseDigitalTwin } from '../model/warehouse-digital-twin'

export async function loadWarehouseDigitalTwin() {
  const [stockResult, locations] = await Promise.all([
    loadStocks({
      keyword: '', customerId: '', locationId: '', categories: [], allCategories: [], includeInvalid: false,
    }),
    loadInventoryLocations(),
  ])
  if (!stockResult.ok) throw new Error(stockResult.error)
  return buildWarehouseDigitalTwin(stockResult.data, locations)
}
