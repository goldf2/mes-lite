import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { CreateWarehousePackageCommand } from '../contracts/warehouse-package-schema'
import { packagePersonnel, WarehousePackageError } from '../domain/warehouse-package'
import { warehousePackageInclude, warehousePackageScopeWhere, serializeWarehousePackage, warehouseUnpackedQuantity } from './warehouse-package-query-service'
import { warehousePackingLotInclude, warehousePackingProvenance } from './warehouse-package-provenance-service'

const templateVersion = 'WAREHOUSE_PACKING_V1'
const packagingNames: Record<string, string> = { CARTON: '纸箱', METAL_CAGE: '金属网箱', PLASTIC_BOX: '塑料周转盒', OTHER: '其他包装' }

async function warehouseWrite<T>(operation: () => Promise<T>) {
  try { return await operation() } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034', 'P2028'].includes(error.code)) throw new WarehousePackageError('库存或装箱记录已变化，请刷新后重试', 409)
    throw error
  }
}

async function createLabelRevision(tx: Prisma.TransactionClient, id: string, actorName: string) {
  const record = await tx.packageDocument.findUniqueOrThrow({ where: { id }, include: warehousePackageInclude })
  const existing = await tx.packageLabelRevision.findUnique({ where: { packageDocumentId_contentVersion_templateVersion: { packageDocumentId: id, contentVersion: record.contentVersion, templateVersion } } })
  if (existing) return labelRevisionResponse(existing, record.packageNo)
  const item = record.items[0]
  if (!item || record.items.length !== 1 || !item.inventoryLotId) throw new WarehousePackageError('箱内明细缺少可信产品批次，不能打印', 409)
  const provenance = await tx.inventoryLot.findUnique({ where: { id: item.inventoryLotId }, include: warehousePackingLotInclude })
  const payload = {
    title: '货物装箱标签', code: record.packageNo, qrValue: `${record.packageNo}#v${record.contentVersion}`,
    description: `${item.material.code} · ${item.material.name}`, details: [], layout: 'packing',
    fields: [
      { label: '装箱编号', value: record.packageNo }, { label: '产品编码', value: item.material.code },
      { label: '产品名称', value: item.material.name }, { label: '规格', value: item.material.spec || '未记录' },
      { label: '数量', value: `${item.quantity} ${item.unitSnapshot}` }, { label: '库存批次', value: item.lotNoSnapshot || '未记录' },
      { label: '生产日期', value: record.productionDate ? record.productionDate.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未记录' },
      { label: '生产人员', value: packagePersonnel(record.productionPersonnel).join('、') || '未记录' },
      { label: '质检人员', value: packagePersonnel(record.qualityPersonnel).join('、') || '未记录' },
      { label: '包装人员', value: record.packedBy }, { label: '包装日期', value: record.packedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) },
      { label: '包装类型', value: packagingNames[record.packagingType] || record.packagingType },
    ],
    source: { personnelSource: record.personnelSource, inventoryLotId: item.inventoryLotId, ...(provenance ? warehousePackingProvenance(provenance) : {}) },
  }
  const revision = await tx.packageLabelRevision.create({ data: { packageDocumentId: id, contentVersion: record.contentVersion, templateVersion, payloadJson: JSON.stringify(payload), createdBy: actorName } })
  return labelRevisionResponse(revision, record.packageNo)
}

function labelRevisionResponse(revision: { id: string; contentVersion: number; payloadJson: string; createdAt: Date }, packageNo: string) {
  return { id: revision.id, contentVersion: revision.contentVersion, qrValue: `${packageNo}#v${revision.contentVersion}`, createdAt: revision.createdAt, payload: JSON.parse(revision.payloadJson) as Record<string, unknown> }
}

export async function createWarehousePackage(input: CreateWarehousePackageCommand, actorName: string, scope: EffectiveDataScope = unrestrictedDataScope, now = new Date()) {
  if (input.quantity < 0.000001 || !Number.isFinite(input.quantity) || input.quantity !== Number(input.quantity.toFixed(6))) throw new WarehousePackageError('装箱数量须为正数且最多保留 6 位小数')
  assertInventoryLocationDataScope(scope, [input.locationId])
  return warehouseWrite(() => prisma.$transaction(async (tx) => {
    if (input.clientRequestId) {
      const existing = await tx.packageDocument.findUnique({ where: { clientRequestId: input.clientRequestId }, include: warehousePackageInclude })
      if (existing) {
        assertInventoryLocationDataScope(scope, [existing.placement?.locationId])
        const item = existing.items[0]
        if (existing.sourceType !== 'WAREHOUSE' || item?.inventoryLotId !== input.inventoryLotId || Number(item.quantity) !== input.quantity || existing.placement?.locationId !== input.locationId) throw new WarehousePackageError('该请求编号已用于其他装箱内容', 409)
        return serializeWarehousePackage(existing)
      }
    }
    const [lot, location] = await Promise.all([
      tx.inventoryLot.findUnique({ where: { id: input.inventoryLotId }, include: warehousePackingLotInclude }),
      tx.inventoryLocation.findUnique({ where: { id: input.locationId } }),
    ])
    if (!lot || lot.status !== 'OPEN' || lot.material.deletedAt) throw new WarehousePackageError('所选真实库存批次不存在或不可用')
    if (lot.sourceType.startsWith('LEGACY')) throw new WarehousePackageError('历史兼容批次未核实真实来源，不能装箱贴标')
    if (!location || location.deletedAt || !location.isActive) throw new WarehousePackageError('装箱库位不存在或已停用')
    const available = await warehouseUnpackedQuantity(tx, lot.id, lot.materialId, location.id)
    if (input.quantity > available + 0.000001) throw new WarehousePackageError(`该批次未装箱可用数量仅 ${available} ${lot.material.stockUnit}`, 409)
    const datePrefix = `BX-${now.toISOString().slice(0, 10).replaceAll('-', '')}-`
    const latest = await tx.packageDocument.findFirst({ where: { packageNo: { startsWith: datePrefix } }, orderBy: { packageNo: 'desc' }, select: { packageNo: true } })
    const sequence = latest ? Number(latest.packageNo.slice(datePrefix.length)) + 1 : 1
    const provenance = warehousePackingProvenance(lot)
    const productionPersonnel = input.productionPersonnel ?? provenance.productionPersonnel
    const qualityPersonnel = input.qualityPersonnel ?? provenance.qualityPersonnel
    const manual = (input.productionPersonnel != null && JSON.stringify(input.productionPersonnel) !== JSON.stringify(provenance.productionPersonnel)) || (input.qualityPersonnel != null && JSON.stringify(input.qualityPersonnel) !== JSON.stringify(provenance.qualityPersonnel))
    const created = await tx.packageDocument.create({
      data: {
        packageNo: `${datePrefix}${String(sequence).padStart(3, '0')}`, sourceType: 'WAREHOUSE', status: 'PACKED',
        clientRequestId: input.clientRequestId || null, packagingType: input.packagingType, packedBy: input.packedBy, packedAt: new Date(input.packedAt),
        productionPersonnel: JSON.stringify(productionPersonnel), qualityPersonnel: JSON.stringify(qualityPersonnel), productionDate: provenance.productionDate,
        personnelSource: manual ? 'MANUAL' : productionPersonnel.length || qualityPersonnel.length ? 'SOURCE' : 'UNRECORDED',
        lengthMm: input.lengthMm, widthMm: input.widthMm, heightMm: input.heightMm, grossWeight: input.grossWeight, netWeight: input.netWeight, note: input.note || null,
        items: { create: { materialId: lot.materialId, inventoryLotId: lot.id, inventoryStatus: 'AVAILABLE', quantity: input.quantity, unitSnapshot: lot.material.stockUnit, lotNoSnapshot: lot.lotNo } },
        placement: { create: { locationId: location.id, precision: 'LOCATION_ONLY', confirmedBy: actorName, confirmedAt: now } },
      },
    })
    await tx.goodsMovement.create({ data: { packageDocumentId: created.id, movementType: 'PACK', afterJson: JSON.stringify({ locationId: location.id, precision: 'LOCATION_ONLY' }), clientRequestId: `PACK:${created.id}`, operatedBy: actorName } })
    await createLabelRevision(tx, created.id, actorName)
    return serializeWarehousePackage(await tx.packageDocument.findUniqueOrThrow({ where: { id: created.id }, include: warehousePackageInclude }))
  }))
}

export async function voidWarehousePackage(id: string, reason: string, actorName: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return warehouseWrite(() => prisma.$transaction(async (tx) => {
    const before = await tx.packageDocument.findFirst({ where: { id, sourceType: 'WAREHOUSE', deletedAt: null, ...warehousePackageScopeWhere(scope) }, include: warehousePackageInclude })
    if (!before) throw new WarehousePackageError('装箱记录不存在或无权访问', 404)
    assertInventoryLocationDataScope(scope, [before.placement?.locationId])
    if (before.status !== 'PACKED' || before.allocations.length > 0) throw new WarehousePackageError('已占用或已发货的箱不能作废，请先取消待发货单', 409)
    const changed = await tx.packageDocument.updateMany({ where: { id, status: 'PACKED', revision: before.revision }, data: { status: 'VOIDED', deletedAt: new Date(), deletedBy: actorName, revision: { increment: 1 } } })
    if (changed.count !== 1) throw new WarehousePackageError('装箱记录已变化，请刷新', 409)
    await tx.goodsMovement.create({ data: { packageDocumentId: id, movementType: 'VOID', beforeJson: JSON.stringify(before.placement), afterJson: JSON.stringify({ status: 'VOIDED', reason }), clientRequestId: `VOID:${id}`, operatedBy: actorName } })
    return { before: serializeWarehousePackage(before), updated: serializeWarehousePackage(await tx.packageDocument.findUniqueOrThrow({ where: { id }, include: warehousePackageInclude })) }
  }))
}

export async function getOrCreateWarehousePackageLabel(id: string, actorName: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return warehouseWrite(() => prisma.$transaction(async (tx) => {
    const record = await tx.packageDocument.findFirst({ where: { id, sourceType: 'WAREHOUSE', ...warehousePackageScopeWhere(scope) }, include: { placement: true } })
    if (!record) throw new WarehousePackageError('装箱记录不存在或无权访问', 404)
    assertInventoryLocationDataScope(scope, [record.placement?.locationId])
    if (record.deletedAt || !['PACKED', 'SHIPPED', 'DELIVERED'].includes(record.status)) throw new WarehousePackageError('已作废的装箱记录不能打印有效标签', 409)
    return createLabelRevision(tx, id, actorName)
  }))
}
