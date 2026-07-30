import { prisma } from './prisma'
import { SOFT_DELETE_MODELS, SoftDeleteModelKey } from './soft-delete'

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
  materialIn: ['PENDING', 'REJECTED'],
  order: ['DRAFT', 'CANCELLED'],
  dispatch: ['PENDING', 'CANCELLED'],
  shipment: ['PENDING', 'CANCELLED'],
  return: ['PENDING', 'REJECTED'],
}

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
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  totalCost: number
}) {
  return [
    stock.qty,
    stock.reservedQty,
    stock.availableQty,
    stock.valuationQty,
    stock.reservedValuationQty,
    stock.availableValuationQty,
    stock.totalCost,
  ].some((value) => Math.abs(Number(value || 0)) > 0.000001)
}

async function addWeakReferenceBlockers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  model: SoftDeleteModelKey,
  id: string,
  blockers: string[],
) {
  const ownerType = attachmentOwnerTypes[model]
  const [attachmentCount, scanCount, printCount] = await Promise.all([
    ownerType && model !== 'workInstruction'
      ? tx.documentAttachment.count({ where: { ownerType, ownerId: id } })
      : Promise.resolve(0),
    tx.scanCountSession.count({ where: { referenceId: id } }),
    tx.labelPrintJob.count({ where: { referenceId: id } }),
  ])
  addCountBlocker(blockers, attachmentCount, '附件')
  addCountBlocker(blockers, scanCount, '扫码计数记录')
  addCountBlocker(blockers, printCount, '标签打印记录')
}

export async function purgeArchivedRecord(model: SoftDeleteModelKey, id: string) {
  return prisma.$transaction(async (tx) => {
    const config = SOFT_DELETE_MODELS[model]
    const delegate: any = (tx as any)[model === 'order'
      ? 'productionOrder'
      : model === 'return'
        ? 'returnOrder'
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
    const allowedStatuses = purgeableDocumentStatuses[model]
    if (allowedStatuses && !allowedStatuses.includes(String(current.status))) {
      blockers.push(`业务状态为 ${current.status}，仅 ${allowedStatuses.join(' / ')} 状态允许永久删除`)
    }
    await addWeakReferenceBlockers(tx, model, id, blockers)

    if (model === 'material') {
      const [stock, counts] = await Promise.all([
        tx.stock.findUnique({
          where: { materialId: id },
          include: { _count: { select: { logs: true } } },
        }),
        tx.material.findUniqueOrThrow({
          where: { id },
          select: {
            _count: {
              select: {
                costLayers: true,
                bomItems: true,
                pickItems: true,
                materialIns: true,
                productionOrders: true,
                workInstructions: true,
                processTemplates: true,
                dailyProductionReports: true,
                dailyProductionConsumptions: true,
                shipments: true,
                returnOrders: true,
              },
            },
          },
        }),
      ])
      if (stock) {
        if (hasNonZeroStock(stock)) blockers.push('库存余额或库存金额不为零')
        addCountBlocker(blockers, stock._count.logs, '库存流水')
      }
      addCountBlocker(blockers, counts._count.costLayers, '库存成本层')
      addCountBlocker(blockers, counts._count.bomItems, 'BOM 用料')
      addCountBlocker(blockers, counts._count.pickItems, '工单领料')
      addCountBlocker(blockers, counts._count.materialIns, '来料单')
      addCountBlocker(blockers, counts._count.productionOrders, '生产工单')
      addCountBlocker(blockers, counts._count.workInstructions, '产品文档')
      addCountBlocker(blockers, counts._count.processTemplates, '加工工艺')
      addCountBlocker(blockers, counts._count.dailyProductionReports, '生产日报成品')
      addCountBlocker(blockers, counts._count.dailyProductionConsumptions, '生产日报用料')
      addCountBlocker(blockers, counts._count.shipments, '发货单')
      addCountBlocker(blockers, counts._count.returnOrders, '退货单')
      if (blockers.length === 0 && stock) await tx.stock.delete({ where: { id: stock.id } })
    } else if (model === 'supplier') {
      const count = await tx.materialIn.count({ where: { supplierId: id } })
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
      const [costLayerCount, stockLogCount] = await Promise.all([
        tx.inventoryCostLayer.count({
          where: { OR: [{ materialInId: id }, { sourceId: id }] },
        }),
        tx.stockLog.count({ where: { refId: id } }),
      ])
      addCountBlocker(blockers, costLayerCount, '库存成本层')
      addCountBlocker(blockers, stockLogCount, '库存流水')
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
      const [returnCount, stockLogCount] = await Promise.all([
        tx.returnOrder.count({ where: { shipmentId: id } }),
        tx.stockLog.count({ where: { refId: id } }),
      ])
      addCountBlocker(blockers, returnCount, '退货单')
      addCountBlocker(blockers, stockLogCount, '库存流水')
    } else if (model === 'return') {
      const stockLogCount = await tx.stockLog.count({ where: { refId: id } })
      addCountBlocker(blockers, stockLogCount, '库存流水')
    }

    if (blockers.length > 0) {
      throw new ArchivedRecordPurgeError('归档记录仍有业务引用，不能永久删除', 409, blockers)
    }

    if (model === 'workInstruction') {
      await tx.documentAttachment.deleteMany({
        where: { ownerType: 'WORK_INSTRUCTION', ownerId: id },
      })
    }
    const deleted = await delegate.delete({ where: { id } })
    return {
      id: deleted.id as string,
      entityType: config.entityType,
      entityLabel: workInstructionMaterial
        ? `${workInstructionMaterial.code} · ${workInstructionMaterial.name}`
        : String(deleted[config.labelField] || deleted.id),
      snapshot: deleted,
    }
  })
}
