import { prisma } from '@/lib/prisma'
import {
  allowedInventoryLocationIds,
  stockDataScopeWhere,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { buildWarehouseDigitalTwin } from '../model/warehouse-digital-twin'
import { findStockIntegrityIssues } from './stock-integrity-service'

export async function queryWarehouseDigitalTwin(scope: EffectiveDataScope) {
  const allowedLocationIds = allowedInventoryLocationIds(scope)
  const [stocks, locations, integrityIssues] = await Promise.all([
    prisma.stock.findMany({
      where: stockDataScopeWhere(scope),
      select: {
        id: true,
        material: {
          select: { id: true, code: true, name: true, spec: true, unit: true, stockUnit: true },
        },
        product: { select: { sku: true, name: true, unit: true } },
        locationBalances: {
          where: allowedLocationIds ? { locationId: { in: allowedLocationIds } } : undefined,
          select: {
            locationId: true,
            qty: true,
            availableQty: true,
            quarantineQty: true,
            holdQty: true,
            reworkQty: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.inventoryLocation.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(allowedLocationIds ? { id: { in: allowedLocationIds } } : {}),
      },
      select: { id: true, code: true, name: true, isDefault: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    findStockIntegrityIssues(),
  ])

  return buildWarehouseDigitalTwin(stocks, locations, integrityIssues.length)
}
