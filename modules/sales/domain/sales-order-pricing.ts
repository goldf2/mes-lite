import type { CreateSalesOrderCommand } from '../contracts/sales-order-schema'
import { SalesDomainError } from './sales-errors'

type PricingMaterial = {
  id: string
  stockUnit: string
  unit: string
  defaultSalePrice: number | null
  salesCurrency: string
}

export function normalizeSalesOrderPricing(
  items: CreateSalesOrderCommand['items'],
  materials: PricingMaterial[],
) {
  const materialIds = items.map((item) => item.materialId)
  if (new Set(materialIds).size !== materialIds.length) {
    throw new SalesDomainError('同一物料请合并为一条销售明细')
  }
  if (materials.length !== materialIds.length) throw new SalesDomainError('部分物料不存在或已归档')
  const materialById = new Map(materials.map((material) => [material.id, material]))
  const normalized = items.map((item) => {
    const material = materialById.get(item.materialId)
    if (!material) throw new SalesDomainError('部分物料不存在或已归档')
    const defaultSalePrice = material.defaultSalePrice == null ? null : Number(material.defaultSalePrice)
    const unitPrice = item.unitPrice ?? defaultSalePrice ?? 0
    const currency = material.salesCurrency || 'CNY'
    return {
      materialId: material.id,
      qty: item.qty,
      unit: material.stockUnit || material.unit,
      unitPrice,
      totalAmount: item.qty * unitPrice,
      currency,
      priceSource: defaultSalePrice !== null && Math.abs(unitPrice - defaultSalePrice) < 0.000001
        ? 'MATERIAL_DEFAULT'
        : 'MANUAL',
      defaultSalePriceSnapshot: defaultSalePrice,
      note: item.note?.trim() || null,
    }
  })
  const currencies = new Set(normalized.map((item) => item.currency))
  if (currencies.size > 1) throw new SalesDomainError('同一销售订单暂不支持混合币种')
  return {
    items: normalized,
    currency: normalized[0]?.currency || 'CNY',
    totalAmount: normalized.reduce((sum, item) => sum + item.totalAmount, 0),
  }
}
