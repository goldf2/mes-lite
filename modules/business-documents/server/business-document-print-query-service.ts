import { prisma } from '@/lib/prisma'
import type { BusinessDocumentKind, BusinessDocumentPrintData } from '../contracts/business-document'
import {
  businessDocumentDateText as dateText,
  businessDocumentMoney as money,
  businessDocumentNumberText as numberText,
  businessDocumentPriorityLabels as priorityLabels,
  businessDocumentStatusLabels as statusLabels,
} from '../domain/business-document-format'

export async function loadBusinessDocumentPrintData(
  kind: BusinessDocumentKind,
  id: string,
): Promise<BusinessDocumentPrintData | null> {
  if (kind === 'sales-order') {
    const order = await prisma.salesOrder.findFirst({ where: { id, deletedAt: null }, include: { customer: true, items: { include: { material: true } } } })
    if (!order) return null
    return {
      title: '销售订单', documentNo: order.orderNo, status: statusLabels[order.status] || order.status,
      documentDate: dateText(order.orderDate), referenceNo: order.voucherNo, partyLabel: '客户', partyName: order.customer.name,
      summaryFields: [{ label: '交付日期', value: dateText(order.deliveryDate) }, { label: '联系人', value: order.customer.contact || '-' }, { label: '联系电话', value: order.customer.phone || '-' }],
      columns: [{ label: '序号', key: 'index', width: 0.6, align: 'center' }, { label: '物料编码', key: 'code', width: 1.4 }, { label: '物料名称/规格', key: 'material', width: 2.5 }, { label: '数量', key: 'qty', width: 1, align: 'right' }, { label: '单价', key: 'price', width: 1, align: 'right' }, { label: '金额', key: 'amount', width: 1.1, align: 'right' }],
      rows: order.items.map((item, index) => ({ index: String(index + 1), code: item.material.code, material: `${item.material.name}${item.material.spec ? ` · ${item.material.spec}` : ''}`, qty: `${numberText(item.qty)} ${item.unit}`, price: money(item.unitPrice), amount: money(item.totalAmount) })),
      totalLabel: '订单合计', totalValue: money(order.totalAmount), note: order.note, signatures: ['制单人', '审核人', '客户确认'],
    }
  }

  if (kind === 'material-in') {
    const receipt = await prisma.materialReceipt.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        stagingLocation: true,
        lines: { where: { deletedAt: null }, orderBy: { lineNo: 'asc' }, include: { material: true } },
      },
    })
    if (!receipt) return null
    const totalAmount = receipt.lines.reduce((sum, line) => sum + Number(line.totalAmount), 0)
    return {
      title: '来料入库单', documentNo: receipt.inboundNo, status: statusLabels[receipt.status] || receipt.status,
      documentDate: dateText(receipt.inboundDate), referenceNo: receipt.voucherNo, partyLabel: '供应商', partyName: receipt.supplier.name,
      summaryFields: [{ label: '待分库库位', value: `${receipt.stagingLocation.code} · ${receipt.stagingLocation.name}` }, { label: '物料种类', value: `${receipt.lines.length} 种` }, { label: '收料人', value: receipt.receivedBy || '-' }],
      columns: [{ label: '序号', key: 'index', width: 0.6, align: 'center' }, { label: '物料编码', key: 'code', width: 1.4 }, { label: '物料名称/规格', key: 'material', width: 2.5 }, { label: '库存数量', key: 'qty', width: 1.2, align: 'right' }, { label: '计价数量', key: 'valuation', width: 1.2, align: 'right' }, { label: '金额', key: 'amount', width: 1.1, align: 'right' }],
      rows: receipt.lines.map((line, index) => ({ index: String(index + 1), code: line.material.code, material: `${line.material.name}${line.material.spec ? ` · ${line.material.spec}` : ''}`, qty: `${numberText(line.qty)} ${line.unit}`, valuation: `${numberText(line.valuationQty)} ${line.valuationUnit}`, amount: money(line.totalAmount) })),
      totalLabel: '入库金额', totalValue: money(totalAmount), note: receipt.note, signatures: ['制单人', '仓管员', '供应商送货人'],
    }
  }

  if (kind === 'shipment') {
    const item = await prisma.shipment.findFirst({ where: { id, deletedAt: null }, include: { customerRef: true, items: { include: { material: true, location: true }, orderBy: { sortOrder: 'asc' } } } })
    if (!item) return null
    return {
      title: '发货单', documentNo: item.shipmentNo, status: statusLabels[item.status] || item.status,
      documentDate: dateText(item.shippedAt || item.createdAt), referenceNo: item.voucherNo, partyLabel: '客户', partyName: item.customer,
      summaryFields: [{ label: '明细项数', value: `${item.items.length} 项` }, { label: '发货库位', value: Array.from(new Set(item.items.map((line) => line.location.code))).join('、') }, { label: '物流单号', value: item.trackingNo || '-' }],
      columns: [{ label: '序号', key: 'index', width: 0.6, align: 'center' }, { label: '物料编码', key: 'code', width: 1.4 }, { label: '物料名称/规格', key: 'material', width: 2.7 }, { label: '数量', key: 'qty', width: 1.1, align: 'right' }, { label: '单价', key: 'price', width: 1, align: 'right' }, { label: '金额', key: 'amount', width: 1.1, align: 'right' }],
      rows: item.items.map((line, index) => ({ index: String(index + 1), code: line.material.code, material: `${line.material.name}${line.material.spec ? ` · ${line.material.spec}` : ''}`, qty: `${numberText(line.qty)} ${line.unitSnapshot}`, price: money(line.unitPrice), amount: money(line.totalAmount) })),
      totalLabel: '发货金额', totalValue: money(item.totalAmount), note: item.note, signatures: ['发货人', '承运人', '客户签收'],
    }
  }

  if (kind === 'return') {
    const item = await prisma.returnOrder.findFirst({ where: { id, deletedAt: null }, include: { product: true, material: true, shipmentItem: { include: { material: true } }, location: true, shipment: { include: { customerRef: true } } } })
    if (!item) return null
    return {
      title: '销售退货单', documentNo: item.returnNo, status: statusLabels[item.status] || item.status,
      documentDate: dateText(item.processedAt || item.createdAt), referenceNo: item.voucherNo, partyLabel: '客户', partyName: item.shipment.customerRef?.name || item.shipment.customer || '-',
      summaryFields: [{ label: '原发货单', value: item.shipment.shipmentNo }, { label: '退回库位', value: item.location ? `${item.location.code} · ${item.location.name}` : '默认库位' }, { label: '退货原因', value: item.reason }],
      columns: [{ label: '序号', key: 'index', width: 0.6, align: 'center' }, { label: '物料编码', key: 'code', width: 1.4 }, { label: '物料名称/规格', key: 'material', width: 3 }, { label: '退货数量', key: 'qty', width: 1.3, align: 'right' }, { label: '处理成本', key: 'amount', width: 1.2, align: 'right' }],
      rows: [{ index: '1', code: item.shipmentItem.material.code, material: `${item.shipmentItem.material.name}${item.shipmentItem.material.spec ? ` · ${item.shipmentItem.material.spec}` : ''}`, qty: `${numberText(item.qty)} ${item.stockUnitSnapshot || item.shipmentItem.unitSnapshot}`, amount: money(item.processedCostAmount) }],
      totalLabel: '退货成本', totalValue: money(item.processedCostAmount), note: item.note, signatures: ['制单人', '仓管员', '客户确认'],
    }
  }

  if (kind === 'flow-transfer') {
    const item = await prisma.flowTransfer.findUnique({ where: { id }, include: { material: true, sourceLocation: true, targetLocation: true, employee: true } })
    if (!item) return null
    return {
      title: '流程转移单', documentNo: item.transferNo, status: statusLabels[item.status] || item.status,
      documentDate: dateText(item.transferDate), partyLabel: '操作员工', partyName: item.employee ? `${item.employee.code} · ${item.employee.name}` : item.operator,
      summaryFields: [{ label: '来源库位', value: `${item.sourceLocation.code} · ${item.sourceLocation.name}` }, { label: '目标库位', value: `${item.targetLocation.code} · ${item.targetLocation.name}` }, { label: '确认时间', value: dateText(item.confirmedAt) }],
      columns: [{ label: '序号', key: 'index', width: 0.6, align: 'center' }, { label: '物料编码', key: 'code', width: 1.4 }, { label: '物料名称/规格', key: 'material', width: 3 }, { label: '转移数量', key: 'qty', width: 1.4, align: 'right' }, { label: '流转方向', key: 'direction', width: 2 }],
      rows: [{ index: '1', code: item.material.code, material: `${item.material.name}${item.material.spec ? ` · ${item.material.spec}` : ''}`, qty: `${numberText(item.quantity)} ${item.unit}`, direction: `${item.sourceLocation.name} → ${item.targetLocation.name}` }],
      note: item.status === 'REVERSED' ? `${item.note || ''}${item.note ? '；' : ''}冲销原因：${item.reverseReason || '-'}` : item.note, signatures: ['操作员工', '转出确认', '转入确认'],
    }
  }

  if (kind === 'production-order') {
    const item = await prisma.productionOrder.findFirst({ where: { id, deletedAt: null }, include: { product: true, targetMaterial: true, bom: true } })
    if (!item) return null
    const target = item.targetMaterial
    return {
      title: '生产订单', documentNo: item.groupNo || item.orderNo, status: statusLabels[item.status] || item.status,
      documentDate: dateText(item.startTime || item.createdAt), referenceNo: item.voucherNo, partyLabel: '生产对象', partyName: target?.name || item.product.name,
      summaryFields: [{ label: 'BOM', value: item.bomName ? `${item.bomName} · ${item.bomVersion || '-'}` : item.bom?.name || '-' }, { label: '计划开始', value: dateText(item.startTime) }, { label: '完成时间', value: dateText(item.completeTime) }],
      columns: [{ label: '行号', key: 'index', width: 0.7, align: 'center' }, { label: '物料编码', key: 'code', width: 1.5 }, { label: '生产物料', key: 'material', width: 3 }, { label: '计划数量', key: 'plan', width: 1.3, align: 'right' }, { label: '完成数量', key: 'complete', width: 1.3, align: 'right' }, { label: '报废数量', key: 'scrap', width: 1.1, align: 'right' }],
      rows: [{ index: String(item.lineNo), code: target?.code || item.product.sku, material: target?.name || item.product.name, plan: numberText(item.planQty), complete: numberText(item.completeQty), scrap: numberText(item.scrapQty) }],
      note: item.cancelReason ? `${item.note || ''}${item.note ? '；' : ''}取消原因：${item.cancelReason}` : item.note, signatures: ['计划员', '生产负责人', '完工确认'],
    }
  }

  if (kind === 'dispatch') {
    const item = await prisma.dispatch.findFirst({ where: { id, deletedAt: null }, include: { order: { include: { product: true, targetMaterial: true } }, step: true } })
    if (!item) return null
    const target = item.order.targetMaterial
    return {
      title: '派工单', documentNo: item.dispatchNo, status: statusLabels[item.status] || item.status,
      documentDate: dateText(item.dispatchedAt || item.createdAt), referenceNo: item.voucherNo, partyLabel: '作业人员', partyName: item.workerName,
      summaryFields: [{ label: '生产订单', value: item.order.orderNo }, { label: '工序', value: `${item.step.stepNo}. ${item.step.name}` }, { label: '工作中心', value: item.step.workstation || '-' }, { label: '优先级', value: priorityLabels[item.priority] || item.priority }],
      columns: [{ label: '序号', key: 'index', width: 0.6, align: 'center' }, { label: '物料编码', key: 'code', width: 1.4 }, { label: '生产物料', key: 'material', width: 2.7 }, { label: '工序', key: 'step', width: 1.7 }, { label: '计划数量', key: 'qty', width: 1.2, align: 'right' }],
      rows: [{ index: '1', code: target?.code || item.order.product.sku, material: target?.name || item.order.product.name, step: `${item.step.stepNo}. ${item.step.name}`, qty: numberText(item.planQty) }],
      note: item.note, signatures: ['派工人', '作业人员', '完工确认'],
    }
  }

  return null
}
