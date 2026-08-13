import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  DataScopeError,
  dispatchDataScopeWhere,
  materialReceiptDataScopeWhere,
  productionOrderDataScopeWhere,
  returnDataScopeWhere,
  shipmentDataScopeWhere,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import type { ArchiveModel } from '../contracts/maintenance'

export function archiveDataScopeWhere(model: 'materialIn', scope: EffectiveDataScope): Prisma.MaterialReceiptWhereInput
export function archiveDataScopeWhere(model: 'order', scope: EffectiveDataScope): Prisma.ProductionOrderWhereInput
export function archiveDataScopeWhere(model: 'dispatch', scope: EffectiveDataScope): Prisma.DispatchWhereInput
export function archiveDataScopeWhere(model: 'shipment', scope: EffectiveDataScope): Prisma.ShipmentWhereInput
export function archiveDataScopeWhere(model: 'return', scope: EffectiveDataScope): Prisma.ReturnOrderWhereInput
export function archiveDataScopeWhere(model: ArchiveModel, scope: EffectiveDataScope) {
  if (model === 'materialIn') return materialReceiptDataScopeWhere(scope)
  if (model === 'order') return productionOrderDataScopeWhere(scope)
  if (model === 'dispatch') return dispatchDataScopeWhere(scope)
  if (model === 'shipment') return shipmentDataScopeWhere(scope)
  if (model === 'return') return returnDataScopeWhere(scope)
  return {}
}

export async function assertArchivedRecordDataScope(
  model: ArchiveModel,
  id: string,
  scope: EffectiveDataScope,
) {
  let authorized = true
  if (model === 'materialIn') {
    authorized = Boolean(await prisma.materialReceipt.findFirst({ where: { id, ...materialReceiptDataScopeWhere(scope) }, select: { id: true } }))
  } else if (model === 'order') {
    authorized = Boolean(await prisma.productionOrder.findFirst({ where: { id, ...productionOrderDataScopeWhere(scope) }, select: { id: true } }))
  } else if (model === 'dispatch') {
    authorized = Boolean(await prisma.dispatch.findFirst({ where: { id, ...dispatchDataScopeWhere(scope) }, select: { id: true } }))
  } else if (model === 'shipment') {
    authorized = Boolean(await prisma.shipment.findFirst({ where: { id, ...shipmentDataScopeWhere(scope) }, select: { id: true } }))
  } else if (model === 'return') {
    authorized = Boolean(await prisma.returnOrder.findFirst({ where: { id, ...returnDataScopeWhere(scope) }, select: { id: true } }))
  }
  if (!authorized) throw new DataScopeError('归档记录不在当前账号的数据范围内')
}
