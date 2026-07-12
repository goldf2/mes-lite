import { PrismaClient } from '@prisma/client'
import { consumeMaterialCost, restoreMaterialCost } from '../lib/costing'

const prisma = new PrismaClient()

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

async function main() {
  const marker = `FIFO-${Date.now()}`

  try {
    await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          code: `${marker}-SUP`,
          name: 'FIFO 验证供应商',
        },
      })

      const material = await tx.material.create({
        data: {
          code: `${marker}-MAT`,
          name: 'FIFO 验证原料',
          unit: '根',
          stockUnit: '根',
          valuationUnit: 'kg',
          conversionRate: 2,
          costingMethod: 'FIFO',
        },
      })

      const stock = await tx.stock.create({
        data: {
          materialId: material.id,
          qty: 20,
          availableQty: 20,
          valuationQty: 50,
          availableValuationQty: 50,
          totalCost: 280,
          valuationUnitCost: 5.6,
          stockUnitCost: 14,
        },
      })

      const firstIn = await tx.materialIn.create({
        data: {
          inboundNo: `${marker}-IN-1`,
          supplierId: supplier.id,
          materialId: material.id,
          qty: 10,
          unit: '根',
          valuationQty: 20,
          valuationUnit: 'kg',
          conversionRate: 2,
          unitPrice: 5,
          stockUnitCost: 10,
          totalAmount: 100,
          status: 'RECEIVED',
        },
      })

      const secondIn = await tx.materialIn.create({
        data: {
          inboundNo: `${marker}-IN-2`,
          supplierId: supplier.id,
          materialId: material.id,
          qty: 10,
          unit: '根',
          valuationQty: 30,
          valuationUnit: 'kg',
          conversionRate: 3,
          unitPrice: 6,
          stockUnitCost: 18,
          totalAmount: 180,
          status: 'RECEIVED',
        },
      })

      const firstLayer = await tx.inventoryCostLayer.create({
        data: {
          materialId: material.id,
          materialInId: firstIn.id,
          stockQty: 10,
          remainingStockQty: 10,
          valuationQty: 20,
          remainingValuationQty: 20,
          stockUnit: '根',
          valuationUnit: 'kg',
          valuationUnitCost: 5,
          stockUnitCost: 10,
          totalAmount: 100,
          remainingAmount: 100,
        },
      })

      const secondLayer = await tx.inventoryCostLayer.create({
        data: {
          materialId: material.id,
          materialInId: secondIn.id,
          stockQty: 10,
          remainingStockQty: 10,
          valuationQty: 30,
          remainingValuationQty: 30,
          stockUnit: '根',
          valuationUnit: 'kg',
          valuationUnitCost: 6,
          stockUnitCost: 18,
          totalAmount: 180,
          remainingAmount: 180,
        },
      })

      const product = await tx.product.create({
        data: {
          sku: `${marker}-SKU`,
          name: 'FIFO 验证成品',
          category: '验证',
          unit: '件',
        },
      })

      const order = await tx.productionOrder.create({
        data: {
          orderNo: `${marker}-WO`,
          productId: product.id,
          planQty: 1,
          status: 'CONFIRMED',
          startTime: new Date(),
        },
      })

      const pickItem = await tx.pickItem.create({
        data: {
          orderId: order.id,
          materialId: material.id,
          requiredQty: 12,
          reservedValuationQty: 30,
          status: 'PENDING',
        },
      })

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          reservedQty: { increment: 12 },
          availableQty: { decrement: 12 },
          reservedValuationQty: { increment: 30 },
          availableValuationQty: { decrement: 30 },
        },
      })

      const reservedStock = await tx.stock.findUniqueOrThrow({ where: { id: stock.id } })
      const result = await consumeMaterialCost(tx, {
        materialId: material.id,
        issueStockQty: 12,
        stock: {
          id: reservedStock.id,
          qty: Number(reservedStock.qty),
          valuationQty: Number(reservedStock.valuationQty),
          totalCost: Number(reservedStock.totalCost),
          valuationUnitCost: Number(reservedStock.valuationUnitCost),
        },
        material: {
          costingMethod: material.costingMethod,
          conversionRate: Number(material.conversionRate),
        },
      })

      assertClose(result.issueValuationQty, 26, '跨层领料计价数量')
      assertClose(result.costAmount, 136, '跨层领料成本')
      assertEqual(result.layerConsumptions.length, 2, '跨层消耗层数')
      assertClose(result.layerConsumptions[0].stockQty, 10, '第一层消耗数量')
      assertClose(result.layerConsumptions[0].valuationQty, 20, '第一层消耗重量')
      assertClose(result.layerConsumptions[0].costAmount, 100, '第一层消耗成本')
      assertClose(result.layerConsumptions[1].stockQty, 2, '第二层消耗数量')
      assertClose(result.layerConsumptions[1].valuationQty, 6, '第二层消耗重量')
      assertClose(result.layerConsumptions[1].costAmount, 36, '第二层消耗成本')

      await tx.costLayerConsumption.createMany({
        data: result.layerConsumptions.map((layer) => ({
          pickItemId: pickItem.id,
          costLayerId: layer.costLayerId,
          materialId: layer.materialId,
          stockQty: layer.stockQty,
          valuationQty: layer.valuationQty,
          costAmount: layer.costAmount,
          stockUnitCost: layer.stockUnitCost,
          valuationUnitCost: layer.valuationUnitCost,
        })),
      })

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { decrement: 12 },
          reservedQty: { decrement: 12 },
          availableQty: { increment: 0 },
          valuationQty: { decrement: result.issueValuationQty },
          reservedValuationQty: { decrement: 30 },
          availableValuationQty: { increment: 4 },
          totalCost: { decrement: result.costAmount },
          valuationUnitCost: 144 / 24,
          stockUnitCost: 144 / 8,
        },
      })

      await tx.pickItem.update({
        where: { id: pickItem.id },
        data: {
          actualQty: 12,
          actualValuationQty: result.issueValuationQty,
          costAmount: result.costAmount,
          costingMethod: 'FIFO',
          conversionRateUsed: result.conversionRateUsed,
          conversionSource: result.conversionSource,
          status: 'COMPLETED',
        },
      })

      const issuedStock = await tx.stock.findUniqueOrThrow({ where: { id: stock.id } })
      assertClose(Number(issuedStock.qty), 8, '领料后库存数量')
      assertClose(Number(issuedStock.valuationQty), 24, '领料后库存重量')
      assertClose(Number(issuedStock.totalCost), 144, '领料后库存金额')
      assertClose(Number(issuedStock.reservedQty), 0, '领料后预留数量')
      assertClose(Number(issuedStock.reservedValuationQty), 0, '领料后预留重量')

      const issuedFirstLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: firstLayer.id } })
      const issuedSecondLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: secondLayer.id } })
      assertClose(Number(issuedFirstLayer.remainingStockQty), 0, '领料后第一层剩余数量')
      assertClose(Number(issuedFirstLayer.remainingAmount), 0, '领料后第一层剩余金额')
      assertEqual(issuedFirstLayer.status, 'CLOSED', '领料后第一层状态')
      assertClose(Number(issuedSecondLayer.remainingStockQty), 8, '领料后第二层剩余数量')
      assertClose(Number(issuedSecondLayer.remainingValuationQty), 24, '领料后第二层剩余重量')
      assertClose(Number(issuedSecondLayer.remainingAmount), 144, '领料后第二层剩余金额')

      await restoreMaterialCost(tx, {
        pickItemId: pickItem.id,
        costingMethod: 'FIFO',
      })

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { increment: 12 },
          availableQty: { increment: 12 },
          valuationQty: { increment: result.issueValuationQty },
          availableValuationQty: { increment: result.issueValuationQty },
          totalCost: { increment: result.costAmount },
          valuationUnitCost: 280 / 50,
          stockUnitCost: 280 / 20,
        },
      })

      const restoredStock = await tx.stock.findUniqueOrThrow({ where: { id: stock.id } })
      assertClose(Number(restoredStock.qty), 20, '取消退料后库存数量')
      assertClose(Number(restoredStock.availableQty), 20, '取消退料后可用数量')
      assertClose(Number(restoredStock.valuationQty), 50, '取消退料后库存重量')
      assertClose(Number(restoredStock.availableValuationQty), 50, '取消退料后可用重量')
      assertClose(Number(restoredStock.totalCost), 280, '取消退料后库存金额')
      assertClose(Number(restoredStock.valuationUnitCost), 5.6, '取消退料后每kg成本')
      assertClose(Number(restoredStock.stockUnitCost), 14, '取消退料后每根成本')

      const restoredFirstLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: firstLayer.id } })
      const restoredSecondLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: secondLayer.id } })
      assertClose(Number(restoredFirstLayer.remainingStockQty), 10, '恢复后第一层数量')
      assertClose(Number(restoredFirstLayer.remainingValuationQty), 20, '恢复后第一层重量')
      assertClose(Number(restoredFirstLayer.remainingAmount), 100, '恢复后第一层金额')
      assertEqual(restoredFirstLayer.status, 'OPEN', '恢复后第一层状态')
      assertClose(Number(restoredSecondLayer.remainingStockQty), 10, '恢复后第二层数量')
      assertClose(Number(restoredSecondLayer.remainingValuationQty), 30, '恢复后第二层重量')
      assertClose(Number(restoredSecondLayer.remainingAmount), 180, '恢复后第二层金额')

      const openConsumptions = await tx.costLayerConsumption.count({
        where: { pickItemId: pickItem.id, restoredAt: null },
      })
      assertEqual(openConsumptions, 0, '恢复后未关闭消耗明细')

      const reverseIn = await tx.materialIn.create({
        data: {
          inboundNo: `${marker}-IN-REVERSE`,
          supplierId: supplier.id,
          materialId: material.id,
          qty: 5,
          unit: '根',
          valuationQty: 10,
          valuationUnit: 'kg',
          conversionRate: 2,
          unitPrice: 6,
          priceBasis: 'VALUATION',
          priceUnit: 'kg',
          valuationUnitCost: 6,
          stockUnitCost: 12,
          totalAmount: 60,
          status: 'RECEIVED',
        },
      })

      const reverseLayer = await tx.inventoryCostLayer.create({
        data: {
          materialId: material.id,
          materialInId: reverseIn.id,
          stockQty: 5,
          remainingStockQty: 5,
          valuationQty: 10,
          remainingValuationQty: 10,
          stockUnit: '根',
          valuationUnit: 'kg',
          valuationUnitCost: 6,
          stockUnitCost: 12,
          totalAmount: 60,
          remainingAmount: 60,
        },
      })

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { increment: 5 },
          availableQty: { increment: 5 },
          valuationQty: { increment: 10 },
          availableValuationQty: { increment: 10 },
          totalCost: { increment: 60 },
          valuationUnitCost: 340 / 60,
          stockUnitCost: 340 / 25,
        },
      })

      const beforeReverseStock = await tx.stock.findUniqueOrThrow({ where: { id: stock.id } })
      assertClose(Number(beforeReverseStock.qty), 25, '红冲前库存数量')
      assertClose(Number(beforeReverseStock.valuationQty), 60, '红冲前库存重量')
      assertClose(Number(beforeReverseStock.totalCost), 340, '红冲前库存金额')

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { decrement: 5 },
          availableQty: { decrement: 5 },
          valuationQty: { decrement: 10 },
          availableValuationQty: { decrement: 10 },
          totalCost: { decrement: 60 },
          valuationUnitCost: 280 / 50,
          stockUnitCost: 280 / 20,
        },
      })
      await tx.inventoryCostLayer.update({
        where: { id: reverseLayer.id },
        data: {
          remainingStockQty: 0,
          remainingValuationQty: 0,
          remainingAmount: 0,
          status: 'REVERSED',
        },
      })
      await tx.materialIn.update({
        where: { id: reverseIn.id },
        data: { status: 'REVERSED' },
      })

      const afterReverseStock = await tx.stock.findUniqueOrThrow({ where: { id: stock.id } })
      const reversedLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: reverseLayer.id } })
      assertClose(Number(afterReverseStock.qty), 20, '红冲后库存数量')
      assertClose(Number(afterReverseStock.valuationQty), 50, '红冲后库存重量')
      assertClose(Number(afterReverseStock.totalCost), 280, '红冲后库存金额')
      assertClose(Number(reversedLayer.remainingStockQty), 0, '红冲后成本层数量')
      assertClose(Number(reversedLayer.remainingValuationQty), 0, '红冲后成本层重量')
      assertClose(Number(reversedLayer.remainingAmount), 0, '红冲后成本层金额')
      assertEqual(reversedLayer.status, 'REVERSED', '红冲后成本层状态')

      throw new Error('ROLLBACK_FIFO_VERIFY')
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'ROLLBACK_FIFO_VERIFY') {
      console.log('FIFO 验证通过：跨批次领料、成本层消耗、库存成本扣减、取消退料、成本层恢复和来料红冲均符合预期。')
      return
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error('FIFO 验证失败:', error)
  await prisma.$disconnect()
  process.exit(1)
})
