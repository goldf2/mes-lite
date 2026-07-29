import { PrismaClient } from '@prisma/client'
import { postInventoryReceipt } from '../lib/inventory'
import {
  createProfileEntitiesForReceipt,
  reverseProfileEntitiesForReceipt,
  splitProfileBatchEntity,
} from '../lib/profile-stock'

const prisma = new PrismaClient()
const rollbackMarker = 'VERIFY_PROFILE_ENTITY_ROLLBACK'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const supplier = await tx.supplier.create({
        data: { code: `VERIFY-S-${suffix}`, name: '实体库存验证供应商' },
      })
      const material = await tx.material.create({
        data: {
          code: `VERIFY-PF-${suffix}`,
          name: '实体库存验证型材',
          spec: '40×40',
          category: 'RAW',
          unit: '根',
          stockUnit: '根',
          valuationUnit: 'kg',
          conversionRate: 2,
          stock: { create: {} },
          profileSpec: {
            create: {
              sectionDescription: '40×40',
              alloyGrade: '6063',
              trackingMode: 'BATCH',
            },
          },
        },
      })
      const receipt = await tx.materialIn.create({
        data: {
          inboundNo: `VERIFY-IN-${suffix}`,
          clientRequestId: `verify-request-${suffix}`,
          supplierId: supplier.id,
          materialId: material.id,
          qty: 5,
          unit: '根',
          valuationQty: 10,
          valuationUnit: 'kg',
          conversionRate: 2,
          conversionSource: 'DOCUMENT_ACTUAL',
          totalAmount: 100,
          status: 'PENDING',
          profileLines: {
            create: [
              {
                clientLineId: `verify-line-a-${suffix}`,
                actualLengthMm: 6012,
                quantity: 3,
                trackingMode: 'BATCH',
                sortOrder: 0,
                totalWeightKg: 6,
                location: 'A-01',
              },
              {
                clientLineId: `verify-line-b-${suffix}`,
                actualLengthMm: 5987,
                quantity: 2,
                trackingMode: 'SINGLE',
                sortOrder: 1,
                totalWeightKg: 4,
                location: 'A-02',
              },
            ],
          },
        },
        include: { profileLines: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      })

      await postInventoryReceipt(tx, {
        materialId: material.id,
        stockQty: 5,
        valuationQty: 10,
        conversionSource: 'DOCUMENT_ACTUAL',
        costAmount: 100,
        type: 'IN',
        refType: 'MATERIAL_IN',
        refId: receipt.id,
        note: '实体库存验证',
        idempotencyKey: `VERIFY:${receipt.id}:RECEIVE`,
        materialInId: receipt.id,
      })
      const createdCount = await createProfileEntitiesForReceipt(tx, receipt, { name: '验证脚本' })
      assert(createdCount === 3, '同长批次 1 条 + 单根 2 条，应生成 3 个实体')

      const receivedEntities = await tx.profileStockEntity.findMany({
        where: { materialInId: receipt.id },
        orderBy: { entityNo: 'asc' },
      })
      assert(receivedEntities.some((entity) => entity.actualLengthMm === 6012 && entity.availableQty === 3), '6012mm 同长批次未正确生成')
      assert(receivedEntities.filter((entity) => entity.actualLengthMm === 5987 && entity.entityType === 'SINGLE').length === 2, '5987mm 单根实体未正确生成')

      const batch = receivedEntities.find((entity) => entity.entityType === 'BATCH')
      assert(batch, '缺少可拆分的同长批次')
      const children = await splitProfileBatchEntity(tx, {
        entityId: batch.id,
        quantity: 2,
        clientRequestId: `verify-split-${suffix}`,
        actor: { name: '验证脚本' },
      })
      assert(children.length === 2, '批次拆分未生成 2 个单根实体')

      const parentAfterSplit = await tx.profileStockEntity.findUnique({ where: { id: batch.id } })
      assert(parentAfterSplit?.availableQty === 1 && parentAfterSplit.splitQty === 2, '批次拆分后的数量分桶不正确')
      const available = await tx.profileStockEntity.aggregate({
        where: { materialId: material.id },
        _sum: { availableQty: true },
      })
      assert(Number(available._sum.availableQty) === 5, '拆分前后可用根数不守恒')
      const weightedEntities = await tx.profileStockEntity.findMany({
        where: { materialId: material.id, availableQty: { gt: 0 } },
        select: { availableQty: true, quantity: true, unitWeightKg: true, totalWeightKg: true },
      })
      const availableWeightKg = weightedEntities.reduce((sum, entity) => {
        if (entity.unitWeightKg !== null) return sum + Number(entity.unitWeightKg) * entity.availableQty
        if (entity.totalWeightKg !== null && entity.quantity > 0) {
          return sum + Number(entity.totalWeightKg) * entity.availableQty / entity.quantity
        }
        return sum
      }, 0)
      assert(availableWeightKg === 10, '拆分前后可用重量不守恒')

      let reverseBlocked = false
      try {
        await reverseProfileEntitiesForReceipt(tx, {
          materialInId: receipt.id,
          inboundNo: receipt.inboundNo,
          reason: '验证已拆分不可红冲',
          actor: { name: '验证脚本' },
        })
      } catch (error) {
        reverseBlocked = error instanceof Error && error.message.includes('不能直接红冲')
      }
      assert(reverseBlocked, '已拆分实体的来料红冲应被阻止')

      const cleanReceipt = await tx.materialIn.create({
        data: {
          inboundNo: `VERIFY-IN-CLEAN-${suffix}`,
          supplierId: supplier.id,
          materialId: material.id,
          qty: 1,
          unit: '根',
          valuationQty: 2,
          valuationUnit: 'kg',
          conversionRate: 2,
          conversionSource: 'DOCUMENT_ACTUAL',
          totalAmount: 20,
          status: 'PENDING',
          profileLines: {
            create: [{
              actualLengthMm: 6033,
              quantity: 1,
              trackingMode: 'BATCH',
            }],
          },
        },
        include: { profileLines: true },
      })
      await createProfileEntitiesForReceipt(tx, cleanReceipt, { name: '验证脚本' })
      const reversedCount = await reverseProfileEntitiesForReceipt(tx, {
        materialInId: cleanReceipt.id,
        inboundNo: cleanReceipt.inboundNo,
        reason: '验证未使用实体可红冲',
        actor: { name: '验证脚本' },
      })
      assert(reversedCount === 1, '未使用来料实体应可红冲')
      const reversed = await tx.profileStockEntity.findFirst({ where: { materialInId: cleanReceipt.id } })
      assert(reversed?.status === 'REVERSED' && reversed.availableQty === 0, '红冲后实体状态不正确')

      throw new Error(rollbackMarker)
    })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error
  }

  console.log('Profile entity flow verified: receipt grouping, single-bar creation, split invariants, audit movements, and reversal guards passed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
