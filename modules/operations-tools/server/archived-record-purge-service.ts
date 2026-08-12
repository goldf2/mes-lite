import { prisma } from '@/lib/prisma'
import { SOFT_DELETE_MODELS, SoftDeleteModelKey } from './soft-delete-models'

const attachmentOwnerTypes: Partial<Record<SoftDeleteModelKey, string>> = {
  material: 'MATERIAL',
  supplier: 'SUPPLIER',
  customer: 'CUSTOMER',
  materialIn: 'MATERIAL_IN',
  workInstruction: 'WORK_INSTRUCTION',
  order: 'ORDER',
  dispatch: 'DISPATCH',
  shipment: 'SHIPMENT',
  return: 'RETURN',
}

const purgeableDocumentStatuses: Partial<Record<SoftDeleteModelKey, string[]>> = {
  materialIn: ['PENDING', 'REJECTED', 'REVERSED'],
  order: ['DRAFT', 'CANCELLED'],
  dispatch: ['PENDING', 'CANCELLED'],
  shipment: ['PENDING', 'CANCELLED'],
  return: ['PENDING', 'REJECTED'],
}

const purgeableNestedMaterialInStatuses = new Set(['REJECTED', 'REVERSED'])
const purgeableInventoryLogTypes = new Set(['IN', 'REVERSE_IN'])
const zeroTolerance = 0.000001

export class ArchivedRecordPurgeError extends Error {
  status: number
  blockers: string[]

  constructor(message: string, status: number, blockers: string[] = []) {
    super(message)
    this.name = 'ArchivedRecordPurgeError'
    this.status = status
    this.blockers = blockers
  }
}

function addCountBlocker(blockers: string[], count: number, label: string) {
  if (count > 0) blockers.push(`${label} ${count} 条`)
}

function hasNonZeroStock(stock: {
  qty: number
  reservedQty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  quarantineValuationQty: number
  holdValuationQty: number
  totalCost: number
  quarantineCost: number
  holdCost: number
}) {
  return [
    stock.qty,
    stock.reservedQty,
    stock.availableQty,
    stock.quarantineQty,
    stock.holdQty,
    stock.valuationQty,
    stock.reservedValuationQty,
    stock.availableValuationQty,
    stock.quarantineValuationQty,
    stock.holdValuationQty,
    stock.totalCost,
    stock.quarantineCost,
    stock.holdCost,
  ].some((value) => Math.abs(Number(value || 0)) > 0.000001)
}

async function addWeakReferenceBlockers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  model: SoftDeleteModelKey,
  id: string,
  blockers: string[],
) {
  const [scanCount, printCount] = await Promise.all([
    tx.scanCountSession.count({ where: { referenceId: id } }),
    tx.labelPrintJob.count({ where: { referenceId: id } }),
  ])
  addCountBlocker(blockers, scanCount, '扫码计数记录')
  addCountBlocker(blockers, printCount, '标签打印记录')
}

function hasNonZeroCostLayer(layer: {
  remainingStockQty: number
  remainingValuationQty: number
  remainingAmount: number
}) {
  return [
    layer.remainingStockQty,
    layer.remainingValuationQty,
    layer.remainingAmount,
  ].some((value) => Math.abs(Number(value || 0)) > zeroTolerance)
}

function hasNonZeroMovementTotal(logs: Array<{
  qty: number
  valuationQty: number | null
  costAmount: number | null
}>) {
  const totals = logs.reduce<{ qty: number; valuationQty: number; costAmount: number }>((sum, log) => ({
    qty: sum.qty + Number(log.qty || 0),
    valuationQty: sum.valuationQty + Number(log.valuationQty || 0),
    costAmount: sum.costAmount + Number(log.costAmount || 0),
  }), { qty: 0, valuationQty: 0, costAmount: 0 })
  return Object.values(totals).some((value) => Math.abs(value) > zeroTolerance)
}

export async function purgeArchivedRecord(model: SoftDeleteModelKey, id: string) {
  return prisma.$transaction(async (tx) => {
    const config = SOFT_DELETE_MODELS[model]
    const delegate: any = (tx as any)[model === 'order'
      ? 'productionOrder'
      : model === 'return'
        ? 'returnOrder'
        : model === 'materialIn'
          ? 'materialReceipt'
        : model]
    const current = await delegate.findUnique({ where: { id } })
    if (!current) throw new ArchivedRecordPurgeError('归档记录不存在', 404)
    if (!current.deletedAt) throw new ArchivedRecordPurgeError('记录尚未归档，不能永久删除', 409)
    const workInstructionMaterial = model === 'workInstruction'
      ? await tx.material.findUnique({
          where: { id: current.materialId },
          select: { code: true, name: true },
        })
      : null

    const blockers: string[] = []
    const attachmentOwners: Array<{ ownerType: string; ownerId: string }> = []
    const ownerType = attachmentOwnerTypes[model]
    if (ownerType) attachmentOwners.push({ ownerType, ownerId: id })
    let materialStockId: string | null = null
    let nestedMaterialInIds: string[] = []
    const allowedStatuses = purgeableDocumentStatuses[model]
    if (allowedStatuses && !allowedStatuses.includes(String(current.status))) {
      blockers.push(`业务状态为 ${current.status}，仅 ${allowedStatuses.join(' / ')} 状态允许永久删除`)
    }
    await addWeakReferenceBlockers(tx, model, id, blockers)

    if (model === 'material') {
      const [stock, counts, materialIns, costLayers, detachedConsumptionCount] = await Promise.all([
        tx.stock.findUnique({
          where: { materialId: id },
          include: {
            logs: {
              select: {
                id: true,
                type: true,
                qty: true,
                valuationQty: true,
                costAmount: true,
                refId: true,
              },
            },
          },
        }),
        tx.material.findUniqueOrThrow({
          where: { id },
          select: {
            _count: {
              select: {
                bomItems: true,
                pickItems: true,
                productionOrders: true,
                workInstructions: true,
                processTemplates: true,
                dailyProductionReports: true,
                dailyProductionConsumptions: true,
                shipments: true,
                returnOrders: true,
                inventoryLots: true,
              },
            },
          },
        }),
        tx.materialIn.findMany({
          where: { materialId: id },
          select: { id: true, status: true, deletedAt: true },
        }),
        tx.inventoryCostLayer.findMany({
          where: { materialId: id },
          select: {
            id: true,
            status: true,
            remainingStockQty: true,
            remainingValuationQty: true,
            remainingAmount: true,
            _count: { select: { consumptions: true } },
          },
        }),
        tx.costLayerConsumption.count({ where: { materialId: id } }),
      ])
      materialStockId = stock?.id || null
      nestedMaterialInIds = materialIns.map((item) => item.id)
      attachmentOwners.push(...nestedMaterialInIds.map((ownerId) => ({ ownerType: 'MATERIAL_IN', ownerId })))

      if (stock) {
        if (hasNonZeroStock(stock)) blockers.push('库存余额或库存金额不为零')
      }
      const unsafeMaterialIns = materialIns.filter((item) => (
        !purgeableNestedMaterialInStatuses.has(item.status) &&
        !(item.status === 'PENDING' && item.deletedAt)
      ))
      addCountBlocker(blockers, unsafeMaterialIns.length, '仍有效或未归档的来料单')

      const unsafeCostLayers = costLayers.filter((layer) => (
        layer.status !== 'REVERSED' ||
        hasNonZeroCostLayer(layer) ||
        layer._count.consumptions > 0
      ))
      addCountBlocker(blockers, unsafeCostLayers.length, '未完全红冲的库存成本层')
      addCountBlocker(blockers, detachedConsumptionCount, '库存成本消耗记录')

      if (stock?.logs.length) {
        const materialInIdSet = new Set(nestedMaterialInIds)
        const unsafeLogs = stock.logs.filter((log) => (
          !purgeableInventoryLogTypes.has(log.type) ||
          !log.refId ||
          !materialInIdSet.has(log.refId)
        ))
        addCountBlocker(blockers, unsafeLogs.length, '非来料红冲库存流水')
        if (unsafeLogs.length === 0 && hasNonZeroMovementTotal(stock.logs)) {
          blockers.push('来料库存流水未完全对冲')
        }
      }

      addCountBlocker(blockers, counts._count.bomItems, 'BOM 用料')
      addCountBlocker(blockers, counts._count.pickItems, '工单领料')
      addCountBlocker(blockers, counts._count.productionOrders, '生产工单')
      addCountBlocker(blockers, counts._count.workInstructions, '产品文档')
      addCountBlocker(blockers, counts._count.processTemplates, '加工工艺')
      addCountBlocker(blockers, counts._count.dailyProductionReports, '生产日报成品')
      addCountBlocker(blockers, counts._count.dailyProductionConsumptions, '生产日报用料')
      addCountBlocker(blockers, counts._count.shipments, '发货单')
      addCountBlocker(blockers, counts._count.returnOrders, '退货单')
      addCountBlocker(blockers, counts._count.inventoryLots, '库存批次追溯记录')
    } else if (model === 'supplier') {
      const count = await tx.materialReceipt.count({ where: { supplierId: id } })
      addCountBlocker(blockers, count, '来料单')
    } else if (model === 'customer') {
      const counts = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: {
          _count: {
            select: {
              products: true,
              materials: true,
              shipments: true,
            },
          },
        },
      })
      addCountBlocker(blockers, counts._count.products, '兼容产品')
      addCountBlocker(blockers, counts._count.materials, '物料')
      addCountBlocker(blockers, counts._count.shipments, '发货单')
    } else if (model === 'materialIn') {
      const lineIds = (await tx.materialIn.findMany({ where: { receiptId: id }, select: { id: true } })).map((line) => line.id)
      const [costLayers, stockLogs, lots] = await Promise.all([
        tx.inventoryCostLayer.findMany({
          where: { OR: [{ materialInId: { in: lineIds } }, { sourceId: { in: lineIds } }] },
          select: {
            id: true,
            status: true,
            remainingStockQty: true,
            remainingValuationQty: true,
            remainingAmount: true,
            _count: { select: { consumptions: true } },
          },
        }),
        tx.stockLog.findMany({
          where: { refId: { in: lineIds } },
          select: {
            id: true,
            type: true,
            qty: true,
            valuationQty: true,
            costAmount: true,
          },
        }),
        tx.inventoryLot.findMany({
          where: { materialInId: { in: lineIds } },
          select: {
            id: true,
            status: true,
            balances: { select: { stockQty: true, valuationQty: true, costAmount: true } },
            _count: {
              select: {
                productionInputAllocations: true,
                shipmentAllocations: true,
                returnedLotAllocations: true,
                parentGenealogies: true,
                childGenealogies: true,
              },
            },
          },
        }),
      ])
      const lotIds = lots.map((lot) => lot.id)
      const lotTransactionCount = lotIds.length > 0
        ? await tx.inventoryLotTransaction.count({ where: { lotId: { in: lotIds } } })
        : 0
      if (current.status === 'REVERSED') {
        const unsafeCostLayers = costLayers.filter((layer) => (
          layer.status !== 'REVERSED' ||
          hasNonZeroCostLayer(layer) ||
          layer._count.consumptions > 0
        ))
        const unsafeLogs = stockLogs.filter((log) => !purgeableInventoryLogTypes.has(log.type))
        addCountBlocker(blockers, unsafeCostLayers.length, '未完全红冲的库存成本层')
        addCountBlocker(blockers, unsafeLogs.length, '非来料红冲库存流水')
        if (unsafeLogs.length === 0 && hasNonZeroMovementTotal(stockLogs)) {
          blockers.push('来料库存流水未完全对冲')
        }
        const unsafeLots = lots.filter((lot) => (
          lot.status !== 'REVERSED'
          || lot.balances.some((balance) => [balance.stockQty, balance.valuationQty, balance.costAmount].some((value) => Math.abs(Number(value)) > zeroTolerance))
          || lot._count.productionInputAllocations > 0
          || lot._count.shipmentAllocations > 0
          || lot._count.returnedLotAllocations > 0
          || lot._count.parentGenealogies > 0
          || lot._count.childGenealogies > 0
        ))
        addCountBlocker(blockers, unsafeLots.length, '仍有余额或谱系引用的库存批次')
        const expectedLotTransactions = lots.length * 2
        if (lotTransactionCount !== expectedLotTransactions) {
          blockers.push(`库存批次交易共 ${lotTransactionCount} 条，预期每个完整红冲批次仅保留入库与红冲各 1 条`)
        }
      } else {
        addCountBlocker(blockers, costLayers.length, '库存成本层')
        addCountBlocker(blockers, stockLogs.length, '库存流水')
        addCountBlocker(blockers, lots.length, '库存批次追溯记录')
      }
    } else if (model === 'order') {
      const counts = await tx.productionOrder.findUniqueOrThrow({
        where: { id },
        select: {
          _count: {
            select: {
              picks: true,
              reports: true,
              qcRecords: true,
              stockIns: true,
              dispatches: true,
              costRecords: true,
            },
          },
        },
      })
      const stockLogCount = await tx.stockLog.count({ where: { refId: id } })
      addCountBlocker(blockers, counts._count.picks, '领料记录')
      addCountBlocker(blockers, counts._count.reports, '报工记录')
      addCountBlocker(blockers, counts._count.qcRecords, '质检记录')
      addCountBlocker(blockers, counts._count.stockIns, '成品入库')
      addCountBlocker(blockers, counts._count.dispatches, '派工单')
      addCountBlocker(blockers, counts._count.costRecords, '成本记录')
      addCountBlocker(blockers, stockLogCount, '库存流水')
    } else if (model === 'shipment') {
      const [returnCount, stockLogCount, lotAllocationCount, returnLotAllocationCount] = await Promise.all([
        tx.returnOrder.count({ where: { shipmentId: id } }),
        tx.stockLog.count({ where: { refId: id } }),
        tx.shipmentLotAllocation.count({ where: { shipmentId: id } }),
        tx.returnLotAllocation.count({ where: { shipmentAllocation: { shipmentId: id } } }),
      ])
      addCountBlocker(blockers, returnCount, '退货单')
      addCountBlocker(blockers, stockLogCount, '库存流水')
      addCountBlocker(blockers, lotAllocationCount, '发货批次分配')
      addCountBlocker(blockers, returnLotAllocationCount, '退货批次谱系')
    } else if (model === 'return') {
      const [stockLogCount, lotCount, allocationCount] = await Promise.all([
        tx.stockLog.count({ where: { refId: id } }),
        tx.inventoryLot.count({ where: { returnOrderId: id } }),
        tx.returnLotAllocation.count({ where: { returnOrderId: id } }),
      ])
      addCountBlocker(blockers, stockLogCount, '库存流水')
      addCountBlocker(blockers, lotCount, '退货待检批次')
      addCountBlocker(blockers, allocationCount, '退货来源批次分配')
    }

    if (blockers.length > 0) {
      throw new ArchivedRecordPurgeError('归档记录仍有业务引用，不能永久删除', 409, blockers)
    }

    const ownedAttachments = attachmentOwners.length > 0
      ? await tx.documentAttachment.findMany({
          where: { OR: attachmentOwners },
          select: { storagePath: true },
        })
      : []
    if (attachmentOwners.length > 0) {
      await tx.documentAttachment.deleteMany({
        where: { OR: attachmentOwners },
      })
    }
    if (model === 'material') {
      await tx.inventoryCostLayer.deleteMany({ where: { materialId: id } })
      if (materialStockId) {
        await tx.stockLog.deleteMany({ where: { stockId: materialStockId } })
      }
      if (nestedMaterialInIds.length > 0) {
        await tx.materialIn.deleteMany({ where: { id: { in: nestedMaterialInIds } } })
      }
      if (materialStockId) {
        await tx.stock.delete({ where: { id: materialStockId } })
      }
    } else if (model === 'materialIn') {
      const lineIds = (await tx.materialIn.findMany({ where: { receiptId: id }, select: { id: true } })).map((line) => line.id)
      const lotIds = (await tx.inventoryLot.findMany({ where: { materialInId: { in: lineIds } }, select: { id: true } })).map((lot) => lot.id)
      if (lotIds.length > 0) {
        await tx.inventoryLotTransaction.deleteMany({ where: { lotId: { in: lotIds } } })
        await tx.inventoryLotBalance.deleteMany({ where: { lotId: { in: lotIds } } })
        await tx.inventoryLot.deleteMany({ where: { id: { in: lotIds } } })
      }
      await tx.inventoryCostLayer.deleteMany({
        where: { OR: [{ materialInId: { in: lineIds } }, { sourceId: { in: lineIds } }] },
      })
      await tx.stockLog.deleteMany({ where: { refId: { in: lineIds } } })
    }
    const deleted = await delegate.delete({ where: { id } })
    return {
      id: deleted.id as string,
      entityType: config.entityType,
      entityLabel: workInstructionMaterial
        ? `${workInstructionMaterial.code} · ${workInstructionMaterial.name}`
        : String(deleted[config.labelField] || deleted.id),
      snapshot: deleted,
      attachmentStoragePaths: ownedAttachments.map((attachment) => attachment.storagePath),
    }
  })
}
