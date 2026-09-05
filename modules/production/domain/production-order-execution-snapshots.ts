import { z } from 'zod'
import { ProductionOrderDomainError } from './production-order-errors'
import { serializeProcessRouteSnapshot } from '@/lib/process-route-snapshot'

const workCenterSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  laborRatePerHour: z.number().finite().nonnegative().optional().default(0),
  machineRatePerHour: z.number().finite().nonnegative().optional().default(0),
  energyCostPerHour: z.number().finite().nonnegative().optional().default(0),
})

const processStepSchema = z.object({
  id: z.string().min(1),
  stepNo: z.number().finite(),
  name: z.string().min(1),
  templateCode: z.string().nullable(),
  standardBatchQty: z.number().finite(),
  setupTimeMinutes: z.number().finite(),
  cycleTimeSeconds: z.number().finite(),
  peopleCount: z.number().finite(),
  laborRatePerHour: z.number().finite(),
  machineCount: z.number().finite(),
  machineRatePerHour: z.number().finite(),
  energyCostPerHour: z.number().finite(),
  consumableCostPerBatch: z.number().finite(),
  yieldRate: z.number().finite(),
  workCenter: workCenterSchema.nullable(),
})

const processRouteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean(),
  steps: z.array(processStepSchema),
})

const costLineSchema = z.object({
  id: z.string().min(1),
  lineType: z.string().min(1),
  sourceId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string().min(1),
  quantity: z.number().finite(),
  unit: z.string().min(1),
  unitCost: z.number().finite(),
  materialCost: z.number().finite(),
  laborHours: z.number().finite(),
  machineHours: z.number().finite(),
  laborCost: z.number().finite(),
  machineCost: z.number().finite(),
  directCost: z.number().finite(),
  totalCost: z.number().finite(),
  note: z.string().nullable(),
  sortOrder: z.number().finite(),
})

const costSnapshotSchema = z.object({
  runId: z.string().min(1),
  productId: z.string().min(1),
  materialId: z.string().nullable(),
  bomId: z.string().nullable(),
  bomVersion: z.string().nullable(),
  processRouteId: z.string().nullable(),
  processRouteName: z.string().nullable(),
  quantityBasis: z.number().finite(),
  totalMaterialCost: z.number().finite(),
  totalLaborCost: z.number().finite(),
  totalMachineCost: z.number().finite(),
  totalDirectCost: z.number().finite(),
  totalCost: z.number().finite(),
  unitCost: z.number().finite(),
  lines: z.array(costLineSchema),
})

export type ProductionOrderProcessRouteSnapshot = z.infer<typeof processRouteSchema>
export type ProductionOrderCostSnapshot = z.infer<typeof costSnapshotSchema>

import type { ProcessRouteSnapshotSource as RouteSource } from '@/lib/process-route-snapshot'

type CostRunSource = {
  id: string
  productId: string
  materialId?: string | null
  bomId?: string | null
  bomVersion?: string | null
  processRouteId?: string | null
  processRouteName?: string | null
  quantityBasis: number
  totalMaterialCost: number
  totalLaborCost: number
  totalMachineCost: number
  totalDirectCost: number
  totalCost: number
  unitCost: number
  lines: Array<{
    id: string
    lineType: string
    sourceId?: string | null
    code?: string | null
    name: string
    quantity: number
    unit: string
    unitCost: number
    materialCost: number
    laborHours: number
    machineHours: number
    laborCost: number
    machineCost: number
    directCost: number
    totalCost: number
    note?: string | null
    sortOrder: number
  }>
}

export function serializeProductionOrderProcessRouteSnapshot(route?: RouteSource | null) {
  return serializeProcessRouteSnapshot(route)
}

export function parseProductionOrderProcessRouteSnapshot(value?: string | null): ProductionOrderProcessRouteSnapshot | null {
  if (!value) return null
  try {
    return processRouteSchema.parse(JSON.parse(value))
  } catch {
    throw new ProductionOrderDomainError('生产订单工艺路线快照损坏，无法继续执行')
  }
}

export function serializeProductionOrderCostSnapshot(run?: CostRunSource | null) {
  if (!run) return null
  return JSON.stringify({
    runId: run.id,
    productId: run.productId,
    materialId: run.materialId || null,
    bomId: run.bomId || null,
    bomVersion: run.bomVersion || null,
    processRouteId: run.processRouteId || null,
    processRouteName: run.processRouteName || null,
    quantityBasis: Number(run.quantityBasis || 0),
    totalMaterialCost: Number(run.totalMaterialCost || 0),
    totalLaborCost: Number(run.totalLaborCost || 0),
    totalMachineCost: Number(run.totalMachineCost || 0),
    totalDirectCost: Number(run.totalDirectCost || 0),
    totalCost: Number(run.totalCost || 0),
    unitCost: Number(run.unitCost || 0),
    lines: run.lines.map((line) => ({
      id: line.id,
      lineType: line.lineType,
      sourceId: line.sourceId || null,
      code: line.code || null,
      name: line.name,
      quantity: Number(line.quantity || 0),
      unit: line.unit,
      unitCost: Number(line.unitCost || 0),
      materialCost: Number(line.materialCost || 0),
      laborHours: Number(line.laborHours || 0),
      machineHours: Number(line.machineHours || 0),
      laborCost: Number(line.laborCost || 0),
      machineCost: Number(line.machineCost || 0),
      directCost: Number(line.directCost || 0),
      totalCost: Number(line.totalCost || 0),
      note: line.note || null,
      sortOrder: line.sortOrder,
    })),
  })
}

export function parseProductionOrderCostSnapshot(value?: string | null): ProductionOrderCostSnapshot | null {
  if (!value) return null
  try {
    return costSnapshotSchema.parse(JSON.parse(value))
  } catch {
    throw new ProductionOrderDomainError('生产订单成本快照损坏，无法继续执行')
  }
}
