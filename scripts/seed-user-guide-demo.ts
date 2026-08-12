import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth'
import { postInventoryReceipt } from '../lib/inventory'
import { createMaterialIns } from '../modules/receiving/server/material-in-service'
import { createManagedDispatch } from '../modules/production/server/dispatch-command-service'
import { createManagedFlowTransfer } from '../modules/production/server/flow-transfer-command-service'
import { createProductionOrders } from '../modules/production/server/production-order-command-service'
import { confirmProductionOrder } from '../modules/production/server/production-order-status-service'
import { createManagedReturn, createManagedShipment } from '../modules/sales/server/fulfillment-command-service'
import { deliverManagedShipment, shipManagedShipment } from '../modules/sales/server/fulfillment-status-service'
import { confirmManagedSalesOrder, createManagedSalesOrder } from '../modules/sales/server/sales-order-command-service'

const databaseUrl = process.env.DATABASE_URL || ''
if (!databaseUrl.includes('mes_lite_guide')) {
  throw new Error('作业指导书演示数据只能写入文件名包含 mes_lite_guide 的独立数据库')
}

const prisma = new PrismaClient()
const fixedNow = new Date('2026-08-12T08:00:00+08:00')

async function main() {
  const existingOperators = await prisma.operator.count()
  if (existingOperators > 0) {
    throw new Error('作业指导书演示库不是空库；请新建 mes_lite_guide 数据库后再运行种子脚本')
  }

  const [admin, operator] = await Promise.all([
    prisma.operator.create({
      data: {
        username: 'guide-admin',
        passwordHash: hashPassword('GuideAdmin123!'),
        name: '指导书管理员',
        role: 'ADMIN',
        status: 'ACTIVE',
        approvedAt: fixedNow,
      },
    }),
    prisma.operator.create({
      data: {
        username: 'guide-operator',
        passwordHash: hashPassword('GuideOperator123!'),
        name: '演示操作员',
        role: 'OPERATOR',
        status: 'ACTIVE',
        approvedAt: fixedNow,
      },
    }),
  ])

  const [waiting, rawLocation, wipLocation, finishedLocation, returnLocation] = await Promise.all([
    prisma.inventoryLocation.create({ data: { code: 'LOC-01', name: '待检区', isDefault: true, sortOrder: 10 } }),
    prisma.inventoryLocation.create({ data: { code: 'LOC-02', name: '原料合格区', sortOrder: 20 } }),
    prisma.inventoryLocation.create({ data: { code: 'LOC-03', name: '在制品区', sortOrder: 30 } }),
    prisma.inventoryLocation.create({ data: { code: 'LOC-04', name: '成品区', sortOrder: 40 } }),
    prisma.inventoryLocation.create({ data: { code: 'LOC-05', name: '退货待检区', sortOrder: 50 } }),
  ])

  const [supplier, archivedSupplier, customer, backupCustomer] = await Promise.all([
    prisma.supplier.create({ data: { code: 'SUP-001', name: '宁波精线钢材有限公司', contact: '王经理', phone: '13800001001', address: '浙江省宁波市' } }),
    prisma.supplier.create({ data: { code: 'SUP-OLD', name: '已停用演示供应商', deletedAt: fixedNow, deletedBy: admin.name } }),
    prisma.customer.create({ data: { code: 'CUS-001', name: '华东紧固件贸易有限公司', contact: '陈主管', phone: '13900002001', address: '江苏省苏州市工业园区' } }),
    prisma.customer.create({ data: { code: 'CUS-002', name: '昆山装配制造有限公司', contact: '周工', phone: '13900002002', address: '江苏省昆山市' } }),
  ])

  const [formingCenter, inspectionCenter, packingCenter] = await Promise.all([
    prisma.workCenter.create({ data: { code: 'WC-CF', name: '冷镦成型中心', category: '成型', sortOrder: 10 } }),
    prisma.workCenter.create({ data: { code: 'WC-QC', name: '质量检验中心', category: '检验', sortOrder: 20 } }),
    prisma.workCenter.create({ data: { code: 'WC-PK', name: '包装中心', category: '包装', sortOrder: 30 } }),
  ])

  const [employee, inspector, warehouseKeeper] = await Promise.all([
    prisma.employee.create({ data: { code: 'EMP-001', name: '张成型', department: '生产部', phone: '13700003001', operatorId: operator.id, sortOrder: 10 } }),
    prisma.employee.create({ data: { code: 'EMP-002', name: '李质检', department: '质量部', phone: '13700003002', sortOrder: 20 } }),
    prisma.employee.create({ data: { code: 'EMP-003', name: '赵仓管', department: '仓储部', phone: '13700003003', sortOrder: 30 } }),
  ])

  await prisma.equipment.createMany({ data: [
    { code: 'EQ-CF-01', name: '一号冷镦机', equipmentType: '冷镦机', model: 'CF-6D', manufacturer: '演示设备厂', status: 'AVAILABLE', location: 'A1', workCenterId: formingCenter.id },
    { code: 'EQ-QC-01', name: '影像测量仪', equipmentType: '检测设备', model: 'VM-3020', manufacturer: '演示仪器厂', status: 'IN_USE', location: '质检室', workCenterId: inspectionCenter.id },
    { code: 'EQ-PK-01', name: '自动计数包装机', equipmentType: '包装机', model: 'PK-1000', manufacturer: '演示设备厂', status: 'MAINTENANCE', location: '包装区', workCenterId: packingCenter.id },
  ] })

  const [wire, oil, bolt, scrap] = await Promise.all([
    prisma.material.create({ data: { code: 'RAW-SCM435-8', name: 'SCM435 盘圆', spec: 'Φ8.0mm', category: 'RAW', unit: 'kg', primaryMeasure: 'WEIGHT', stockUnit: 'kg', valuationUnit: 'kg', conversionRate: 1, costingMethod: 'FIFO' } }),
    prisma.material.create({ data: { code: 'AUX-OIL-01', name: '冷镦成型油', spec: '18L/桶', category: 'AUXILIARY', unit: 'kg', primaryMeasure: 'WEIGHT', stockUnit: 'kg', valuationUnit: 'kg', conversionRate: 1 } }),
    prisma.material.create({ data: { code: 'FG-BOLT-M8-30', name: '六角法兰螺栓 M8×30', spec: '10.9级 蓝白锌', category: 'FINISHED', customerId: customer.id, unit: '件', stockUnit: '件', valuationUnit: '件', conversionRate: 1, defaultSalePrice: 1.28 } }),
    prisma.material.create({ data: { code: 'SCRAP-STEEL', name: '冷镦钢废料', spec: '边角料', category: 'SCRAP', unit: 'kg', primaryMeasure: 'WEIGHT', stockUnit: 'kg', valuationUnit: 'kg', conversionRate: 1 } }),
  ])

  const product = await prisma.product.create({
    data: { sku: 'MAT-FG-BOLT-M8-30', materialId: bolt.id, name: bolt.name, category: bolt.category, customerId: customer.id, unit: '件', description: bolt.spec },
  })
  const route = await prisma.processRoute.create({
    data: {
      productId: product.id,
      materialId: bolt.id,
      name: 'M8×30 标准生产路线',
      isDefault: true,
      sortOrder: 10,
      steps: { create: [
        { stepNo: 10, name: '冷镦成型', workstation: '一号冷镦机', standardBatchQty: 1000, setupTimeMinutes: 30, cycleTimeSeconds: 1.2 },
        { stepNo: 20, name: '滚丝', workstation: '滚丝区', standardBatchQty: 1000, setupTimeMinutes: 20, cycleTimeSeconds: 0.9 },
        { stepNo: 30, name: '终检包装', workstation: '包装中心', standardBatchQty: 1000, setupTimeMinutes: 10, cycleTimeSeconds: 0.5 },
      ] },
    },
    include: { steps: true },
  })
  await prisma.processTemplate.createMany({ data: [
    { code: 'PT-CF', name: '标准冷镦成型', category: '成型', workstation: '冷镦成型中心', standardBatchQty: 1000, setupTimeMinutes: 30, cycleTimeSeconds: 1.2, sortOrder: 10 },
    { code: 'PT-QC', name: '终检抽检', category: '检验', workstation: '质量检验中心', standardBatchQty: 1000, setupTimeMinutes: 5, cycleTimeSeconds: 0.2, sortOrder: 20 },
  ] })

  const bom = await prisma.bOM.create({
    data: {
      productId: product.id,
      name: 'M8×30 冷镦标准 BOM',
      version: 'v1.0',
      status: 'RELEASED',
      isActive: true,
      isDefault: true,
      releasedAt: fixedNow,
      releasedBy: admin.name,
      outputQuantity: 1000,
      outputUnit: '件',
      outputs: { create: [
        { materialId: bolt.id, quantity: 1000, unit: '件', isPrimary: true },
        { materialId: scrap.id, quantity: 0.8, unit: 'kg', isPrimary: false },
      ] },
      items: { create: [
        { materialId: wire.id, outputMaterialId: bolt.id, quantity: 21.5, unit: 'kg' },
        { materialId: oil.id, outputMaterialId: bolt.id, quantity: 0.3, unit: 'kg' },
      ] },
    },
  })

  await prisma.$transaction(async (tx) => {
    await postInventoryReceipt(tx, { materialId: wire.id, stockQty: 1200, valuationQty: 1200, costAmount: 9600, type: 'OPENING', refType: 'DEMO', refId: 'wire-opening', note: '指导书演示期初库存', createdBy: admin.name, idempotencyKey: 'GUIDE:WIRE:OPENING', locationId: rawLocation.id })
    await postInventoryReceipt(tx, { materialId: oil.id, stockQty: 180, valuationQty: 180, costAmount: 2700, type: 'OPENING', refType: 'DEMO', refId: 'oil-opening', note: '指导书演示期初库存', createdBy: admin.name, idempotencyKey: 'GUIDE:OIL:OPENING', locationId: rawLocation.id })
    await postInventoryReceipt(tx, { materialId: bolt.id, stockQty: 1500, valuationQty: 1500, costAmount: 1350, type: 'OPENING', refType: 'DEMO', refId: 'bolt-opening', note: '指导书演示期初库存', createdBy: admin.name, idempotencyKey: 'GUIDE:BOLT:OPENING', locationId: finishedLocation.id })
  })

  await createMaterialIns({
    supplierId: supplier.id,
    stagingLocationId: waiting.id,
    voucherNo: 'PO-DEMO-001',
    receivedBy: warehouseKeeper.name,
    note: '待收货演示单',
    items: [{ materialId: wire.id, qty: 300, valuationQty: 300, unitPrice: 8.1, priceBasis: 'STOCK', batchNo: 'HEAT-20260812-A' }],
  }, fixedNow)

  const draftOrder = await createProductionOrders({
    voucherNo: 'PLAN-DEMO-001',
    note: '指导书：待发布生产订单',
    items: [{ targetId: bolt.id, bomId: bom.id, planQty: 5000 }],
  }, fixedNow)
  const releasedOrder = await createProductionOrders({
    voucherNo: 'PLAN-DEMO-002',
    note: '指导书：已发布生产订单',
    items: [{ targetId: bolt.id, bomId: bom.id, planQty: 3000 }],
  }, fixedNow)
  await confirmProductionOrder(releasedOrder.first.id, fixedNow)

  await createManagedDispatch({
    orderId: releasedOrder.first.id,
    stepId: route.steps[0].id,
    workerName: employee.name,
    planQty: 3000,
    priority: 'HIGH',
    voucherNo: 'DP-DEMO-001',
    note: '指导书：待派工任务',
  }, fixedNow)

  await createManagedFlowTransfer({
    transferDate: '2026-08-12',
    materialId: wire.id,
    sourceLocationId: rawLocation.id,
    targetLocationId: wipLocation.id,
    quantity: 100,
    employeeId: warehouseKeeper.id,
    note: '指导书：原料配送到生产现场',
  })

  const draftSalesOrder = await createManagedSalesOrder({
    customerId: customer.id,
    voucherNo: 'CUS-PO-20260812-01',
    orderDate: '2026-08-12',
    deliveryDate: '2026-08-20',
    note: '指导书：待确认销售订单',
    items: [{ materialId: bolt.id, qty: 200, unitPrice: 1.28 }],
  }, fixedNow)
  const confirmedSalesOrder = await createManagedSalesOrder({
    customerId: backupCustomer.id,
    voucherNo: 'CUS-PO-20260812-02',
    orderDate: '2026-08-12',
    deliveryDate: '2026-08-18',
    note: '指导书：发货演示订单',
    items: [{ materialId: bolt.id, qty: 300, unitPrice: 1.35 }],
  }, fixedNow)
  await confirmManagedSalesOrder(confirmedSalesOrder.id)

  await createManagedShipment({
    salesOrderItemId: confirmedSalesOrder.items[0].id,
    locationId: finishedLocation.id,
    qty: 80,
    trackingNo: 'SF-DEMO-PENDING',
    shippedBy: warehouseKeeper.name,
    note: '指导书：待发货单',
  }, fixedNow)
  const deliveredShipment = await createManagedShipment({
    salesOrderItemId: confirmedSalesOrder.items[0].id,
    locationId: finishedLocation.id,
    qty: 60,
    trackingNo: 'SF-DEMO-DELIVERED',
    shippedBy: warehouseKeeper.name,
    note: '指导书：已签收退货来源单',
  }, fixedNow)
  await shipManagedShipment(deliveredShipment.id, warehouseKeeper.name)
  await deliverManagedShipment(deliveredShipment.id)

  await createManagedReturn({
    shipmentId: deliveredShipment.id,
    productId: product.id,
    locationId: returnLocation.id,
    qty: 10,
    reason: '客户抽检尺寸超差',
    note: '指导书：待处理退货单',
  }, fixedNow)

  const parentCategory = await prisma.documentCategory.create({ data: { name: '生产作业文件', sortOrder: 10 } })
  const childCategory = await prisma.documentCategory.create({ data: { name: '冷镦工序指导', parentId: parentCategory.id, sortOrder: 10 } })
  await prisma.workInstruction.create({
    data: {
      categoryId: childCategory.id,
      title: 'M8×30 冷镦成型作业指导',
      version: 'v1.0',
      status: 'ACTIVE',
      materialId: bolt.id,
      workCenters: { connect: [{ id: formingCenter.id }, { id: inspectionCenter.id }] },
      contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '开机前确认模具、材料炉批和首件检验状态。' }] }] }),
      contentText: '开机前确认模具、材料炉批和首件检验状态。',
      note: '指导书演示文档',
    },
  })

  const permissionGroup = await prisma.permissionGroup.create({
    data: {
      code: 'SHOP_FLOOR',
      name: '车间执行组',
      description: '生产订单、派工和库存只读演示权限组',
      settings: { create: [
        { resource: 'orders', canRead: true, canCreate: true, canUpdate: true },
        { resource: 'dispatch', canRead: true, canCreate: true, canUpdate: true },
        { resource: 'stocks', canRead: true },
      ] },
    },
  })
  await prisma.operatorPermissionGroup.create({ data: { operatorId: operator.id, groupId: permissionGroup.id } })

  await prisma.scanCountSession.create({
    data: {
      sessionNo: 'SC-20260812-001',
      name: '成品装箱计数演示',
      purpose: 'SHIPMENT',
      referenceType: 'MATERIAL',
      referenceId: bolt.id,
      expectedCode: bolt.code,
      expectedQty: 100,
      countedQty: 36,
      status: 'OPEN',
      scannerModel: 'USB-HID 演示扫码枪',
      createdBy: admin.name,
      events: { create: [
        { rawValue: `${bolt.code}|12`, code: bolt.code, quantity: 12, result: 'ACCEPTED' },
        { rawValue: `${bolt.code}|24`, code: bolt.code, quantity: 24, result: 'ACCEPTED' },
      ] },
    },
  })
  await prisma.labelPrintJob.create({
    data: {
      jobNo: 'LP-20260812-001',
      templateType: 'MATERIAL',
      referenceType: 'MATERIAL',
      referenceId: bolt.id,
      printerModel: 'TSC-TE244',
      printerDpi: 203,
      labelWidthMm: 70,
      labelHeightMm: 40,
      copies: 2,
      status: 'REQUESTED',
      requestedBy: admin.name,
      payloadJson: JSON.stringify({ code: bolt.code, name: bolt.name, spec: bolt.spec }),
    },
  })

  await prisma.auditLog.create({
    data: { operatorId: admin.id, operatorName: admin.name, action: 'SEED_GUIDE', entityType: 'SYSTEM', entityLabel: '作业指导书演示数据', note: `已创建演示订单 ${draftOrder.first.orderNo} 和 ${draftSalesOrder.orderNo}` },
  })

  console.log(JSON.stringify({
    databaseUrl,
    login: { username: admin.username, password: 'GuideAdmin123!' },
    counts: {
      materials: await prisma.material.count(),
      productionOrders: await prisma.productionOrder.count(),
      salesOrders: await prisma.salesOrder.count(),
      shipments: await prisma.shipment.count(),
    },
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
