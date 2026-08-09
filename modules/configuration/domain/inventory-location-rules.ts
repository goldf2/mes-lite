import type { InventoryLocationInput, InventoryLocationUpdateInput } from '../contracts/inventory-location-schema'
import { InventoryLocationDomainError } from './inventory-location-errors'

export const locationQuantityEpsilon = 0.000001

export function normalizeInventoryLocationCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

export function resolveNewInventoryLocationState(input: InventoryLocationInput, hasActiveDefault: boolean) {
  if (input.isDefault === true && input.isActive === false) {
    throw new InventoryLocationDomainError('默认库位必须保持启用')
  }
  if (!hasActiveDefault) return { isDefault: true, isActive: true }
  return {
    isDefault: input.isDefault === true,
    isActive: input.isDefault === true ? true : (input.isActive ?? true),
  }
}

export function assertInventoryLocationUpdateAllowed(
  existing: { isDefault: boolean; isActive: boolean },
  input: InventoryLocationUpdateInput,
) {
  if (existing.isDefault && (input.isDefault === false || input.isActive === false)) {
    throw new InventoryLocationDomainError('请先将其他库位设为默认库位，再停用当前默认库位')
  }
  if (input.isDefault === true && input.isActive === false) {
    throw new InventoryLocationDomainError('默认库位必须保持启用')
  }
  if (existing.isActive && input.isActive === false) {
    throw new InventoryLocationDomainError('请使用归档操作停用库位，以完成库存和待处理单据校验')
  }
}

export function inventoryLocationHasStock(
  balances: Array<{ qty: number; reservedQty: number }>,
) {
  return balances.some((item) => (
    Math.abs(Number(item.qty)) > locationQuantityEpsilon
    || Math.abs(Number(item.reservedQty)) > locationQuantityEpsilon
  ))
}
