import { prisma } from './prisma'

export const SOFT_DELETE_MODELS = {
  materialIn: {
    entityType: 'MATERIAL_IN',
    labelField: 'inboundNo',
    delegate: prisma.materialIn,
  },
  order: {
    entityType: 'ORDER',
    labelField: 'orderNo',
    delegate: prisma.productionOrder,
  },
  dispatch: {
    entityType: 'DISPATCH',
    labelField: 'dispatchNo',
    delegate: prisma.dispatch,
  },
  shipment: {
    entityType: 'SHIPMENT',
    labelField: 'shipmentNo',
    delegate: prisma.shipment,
  },
  return: {
    entityType: 'RETURN',
    labelField: 'returnNo',
    delegate: prisma.returnOrder,
  },
} as const

export type SoftDeleteModelKey = keyof typeof SOFT_DELETE_MODELS
