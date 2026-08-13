import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth'
import { ensureDefaultPermissions } from '../lib/permissions'
import { postInventoryReceipt } from '../lib/inventory'
import { createMaterialIns } from '../modules/receiving/server/material-in-service'
import { receiveManagedMaterialIn } from '../modules/receiving/server/material-in-status-service'
import { createManagedDispatch } from '../modules/production/server/dispatch-command-service'
import { createManagedFlowTransfer } from '../modules/production/server/flow-transfer-command-service'
import { confirmManagedFlowTransfer } from '../modules/production/server/flow-transfer-status-service'
import { createProductionOrderActual } from '../modules/production/server/production-order-actual-service'
import { confirmProductionOrderActual } from '../modules/production/server/production-order-actual-status-service'
import { createProductionOrders } from '../modules/production/server/production-order-command-service'
import { confirmProductionOrder } from '../modules/production/server/production-order-status-service'
import { decideQualityInspection, disposeQualityInspection } from '../modules/quality/server/quality-inspection-service'
import { createManagedReturn, createManagedShipment } from '../modules/sales/server/fulfillment-command-service'
import { deliverManagedShipment, processManagedReturn, shipManagedShipment } from '../modules/sales/server/fulfillment-status-service'
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

  const [admin, operator, planner, inspectorOperator, warehouseOperator, leadOperator, processOperator, warehouseLeadOperator, salesOperator, personnelOperator, permissionOperator, aiObserverOperator] = await Promise.all([
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
    prisma.operator.create({ data: { username: 'guide-planner', passwordHash: hashPassword('GuidePlanner123!'), name: '演示计划员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-inspector', passwordHash: hashPassword('GuideInspector123!'), name: '演示质检员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-warehouse', passwordHash: hashPassword('GuideWarehouse123!'), name: '演示仓管员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-lead', passwordHash: hashPassword('GuideLead123!'), name: '演示生产主管', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-process', passwordHash: hashPassword('GuideProcess123!'), name: '演示工艺工程师', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-warehouse-lead', passwordHash: hashPassword('GuideWarehouseLead123!'), name: '演示仓库主管', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-sales', passwordHash: hashPassword('GuideSales123!'), name: '演示销售跟单员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-personnel', passwordHash: hashPassword('GuidePersonnel123!'), name: '演示人事管理员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-permission', passwordHash: hashPassword('GuidePermission123!'), name: '演示权限管理员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
    prisma.operator.create({ data: { username: 'guide-ai-reader', passwordHash: hashPassword('GuideAiReader123!'), name: '演示 AI 配置观察员', role: 'OPERATOR', status: 'ACTIVE', approvedAt: fixedNow } }),
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
        { stepNo: 10, name: '冷镦成型', workstation: '一号冷镦机', workCenterId: formingCenter.id, standardBatchQty: 1000, setupTimeMinutes: 30, cycleTimeSeconds: 1.2 },
        { stepNo: 20, name: '滚丝', workstation: '滚丝区', workCenterId: formingCenter.id, standardBatchQty: 1000, setupTimeMinutes: 20, cycleTimeSeconds: 0.9 },
        { stepNo: 30, name: '终检包装', workstation: '包装中心', workCenterId: packingCenter.id, standardBatchQty: 1000, setupTimeMinutes: 10, cycleTimeSeconds: 0.5 },
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
      status: 'DRAFT',
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
  await prisma.bOM.update({
    where: { id: bom.id },
    data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: fixedNow, releasedBy: admin.name },
  })

  await prisma.$transaction(async (tx) => {
    await postInventoryReceipt(tx, { materialId: oil.id, stockQty: 180, valuationQty: 180, costAmount: 2700, type: 'OPENING', refType: 'DEMO', refId: 'oil-opening', note: '指导书演示期初库存', createdBy: admin.name, idempotencyKey: 'GUIDE:OIL:OPENING', locationId: rawLocation.id })
  })

  const receivedMaterialIn = await createMaterialIns({
    supplierId: supplier.id,
    stagingLocationId: rawLocation.id,
    voucherNo: 'PO-DEMO-RECEIVED',
    receivedBy: warehouseKeeper.name,
    note: '指导书：已收货且可追溯的供应商炉批',
    items: [{ materialId: wire.id, qty: 1200, valuationQty: 1200, unitPrice: 8, priceBasis: 'STOCK', batchNo: 'HEAT-SCM435-20260812-R1' }],
  }, fixedNow)
  await receiveManagedMaterialIn(receivedMaterialIn.first.id, warehouseKeeper.name)

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

  const createQualityDemoActual = async (quantity: number, note: string) => {
    const actual = await createProductionOrderActual(releasedOrder.first.id, {
      actualDate: '2026-08-12',
      employeeIds: [employee.id],
      note,
      inputs: [
        { materialId: wire.id, locationId: rawLocation.id, lossMode: 'PERCENT', lossValue: 0 },
        { materialId: oil.id, locationId: rawLocation.id, lossMode: 'PERCENT', lossValue: 0 },
      ],
      outputs: [
        { materialId: bolt.id, locationId: finishedLocation.id, actualQty: quantity },
        { materialId: scrap.id, locationId: finishedLocation.id, actualQty: 0 },
      ],
    })
    await confirmProductionOrderActual(releasedOrder.first.id, actual.id, admin.name)
    return prisma.productionOrderActual.findUniqueOrThrow({
      where: { id: actual.id },
      include: { outputs: { where: { isPrimary: true }, include: { inventoryLot: { include: { inspections: true } } } } },
    })
  }

  const pendingQualityActual = await createQualityDemoActual(400, '指导书：待检批次')
  const passedQualityActual = await createQualityDemoActual(500, '指导书：合格放行批次')
  const heldQualityActual = await createQualityDemoActual(300, '指导书：不合格冻结批次')
  const partialQualityActual = await createQualityDemoActual(240, '指导书：部分放行与冻结批次')
  const reworkQualityActual = await createQualityDemoActual(180, '指导书：返工中批次')
  const traceDraftActual = await createProductionOrderActual(releasedOrder.first.id, {
    actualDate: '2026-08-13',
    employeeIds: [employee.id],
    note: '指导书：待在浏览器确认并生成批次谱系',
    inputs: [
      { materialId: wire.id, locationId: rawLocation.id, lossMode: 'PERCENT', lossValue: 0 },
      { materialId: oil.id, locationId: rawLocation.id, lossMode: 'PERCENT', lossValue: 0 },
    ],
    outputs: [
      { materialId: bolt.id, locationId: finishedLocation.id, actualQty: 200 },
      { materialId: scrap.id, locationId: finishedLocation.id, actualQty: 0 },
    ],
  })
  const passedInspection = passedQualityActual.outputs[0]?.inventoryLot?.inspections[0]
  const heldInspection = heldQualityActual.outputs[0]?.inventoryLot?.inspections[0]
  const partialInspection = partialQualityActual.outputs[0]?.inventoryLot?.inspections[0]
  const reworkInspection = reworkQualityActual.outputs[0]?.inventoryLot?.inspections[0]
  if (!passedInspection || !heldInspection || !partialInspection || !reworkInspection) throw new Error('作业指导书质量演示数据生成失败')
  await decideQualityInspection(passedInspection.id, {
    decision: 'PASS', sampleQty: 20, goodQty: 20, badQty: 0, note: '尺寸和外观抽检合格，整批放行',
  }, inspector.name)
  await decideQualityInspection(heldInspection.id, {
    decision: 'FAIL', sampleQty: 20, goodQty: 17, badQty: 3, note: '抽检发现头部尺寸超差，整批冻结待处置',
  }, inspector.name)
  await decideQualityInspection(partialInspection.id, {
    decision: 'PARTIAL', sampleQty: 20, goodQty: 16, badQty: 4, releaseQty: 160, holdQty: 80, note: '分选后 160 件合格放行，80 件冻结待处置',
  }, inspector.name)
  await decideQualityInspection(reworkInspection.id, {
    decision: 'FAIL', sampleQty: 20, goodQty: 15, badQty: 5, note: '螺纹通止规抽检不合格，冻结后转返工',
  }, inspector.name)
  await disposeQualityInspection(reworkInspection.id, {
    operationId: '9f42ff2b-9c13-4e1b-a644-138d37fa17ce', action: 'REWORK_START', stockQty: 100, reason: '返工单 RW-GUIDE-001：重新滚丝',
  }, inspector.name)

  await createManagedDispatch({
    orderId: releasedOrder.first.id,
    stepId: route.steps[0].id,
    employeeId: employee.id,
    planQty: 3000,
    priority: 'HIGH',
    voucherNo: 'DP-DEMO-001',
    note: '指导书：待派工任务',
  }, fixedNow)

  const confirmedFlowTransfer = await createManagedFlowTransfer({
    transferDate: '2026-08-12',
    materialId: wire.id,
    sourceLocationId: rawLocation.id,
    targetLocationId: wipLocation.id,
    quantity: 100,
    employeeId: warehouseKeeper.id,
    note: '指导书：原料配送到生产现场',
  })
  await confirmManagedFlowTransfer(confirmedFlowTransfer.id, warehouseKeeper.name, fixedNow)

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
  const processedReturn = await createManagedReturn({
    shipmentId: deliveredShipment.id,
    productId: product.id,
    locationId: returnLocation.id,
    qty: 8,
    reason: '客户复测发现螺纹通止规异常',
    note: '指导书：已收货且形成独立待检批次的退货单',
  }, fixedNow)
  await processManagedReturn(processedReturn.id, warehouseKeeper.name)

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

  await ensureDefaultPermissions()
  const aiObserverGroup = await prisma.permissionGroup.create({
    data: {
      code: 'guide_ai_observer',
      name: 'AI 配置只读演示组',
      description: '仅用于指导书验证 AI 配置可查看、不可修改。',
      settings: {
        create: [
          { resource: 'dashboard', canRead: true },
          { resource: 'aiSettings', canRead: true },
        ],
      },
    },
  })
  const roleGroups = await prisma.permissionGroup.findMany({
    where: { code: { in: ['base_access', 'production_executor', 'production_lead', 'warehouse_executor', 'warehouse_lead', 'quality_inspector', 'production_planner', 'process_engineer', 'sales_fulfillment', 'personnel_manager', 'permission_admin'] } },
  })
  const roleGroupId = new Map(roleGroups.map((group) => [group.code, group.id]))
  const assignGroups = async (operatorId: string, codes: string[]) => {
    await prisma.operatorPermissionGroup.createMany({ data: codes.map((code) => ({ operatorId, groupId: roleGroupId.get(code)! })) })
  }
  await Promise.all([
    assignGroups(operator.id, ['base_access', 'production_executor']),
    assignGroups(leadOperator.id, ['base_access', 'production_lead']),
    assignGroups(planner.id, ['base_access', 'production_planner']),
    assignGroups(inspectorOperator.id, ['base_access', 'quality_inspector']),
    assignGroups(warehouseOperator.id, ['base_access', 'warehouse_executor']),
    assignGroups(processOperator.id, ['base_access', 'process_engineer']),
    assignGroups(warehouseLeadOperator.id, ['base_access', 'warehouse_lead']),
    assignGroups(salesOperator.id, ['base_access', 'sales_fulfillment']),
    assignGroups(personnelOperator.id, ['base_access', 'personnel_manager']),
    assignGroups(permissionOperator.id, ['base_access', 'permission_admin']),
    prisma.operatorPermissionGroup.create({ data: { operatorId: aiObserverOperator.id, groupId: aiObserverGroup.id } }),
  ])
  await Promise.all([
    prisma.operatorDataScope.create({ data: {
      operatorId: operator.id, productionMode: 'SELF', inventoryMode: 'LOCATIONS',
      locations: { create: [{ locationId: rawLocation.id }, { locationId: wipLocation.id }] },
    } }),
    prisma.operatorDataScope.create({ data: {
      operatorId: leadOperator.id, productionMode: 'WORK_CENTERS', inventoryMode: 'ALL',
      workCenters: { create: [{ workCenterId: formingCenter.id }, { workCenterId: packingCenter.id }] },
    } }),
    prisma.operatorDataScope.create({ data: {
      operatorId: warehouseOperator.id, productionMode: 'ALL', inventoryMode: 'LOCATIONS',
      locations: { create: [{ locationId: waiting.id }, { locationId: rawLocation.id }, { locationId: finishedLocation.id }, { locationId: returnLocation.id }] },
    } }),
    prisma.operatorPermissionOverride.create({ data: {
      operatorId: operator.id, resource: 'quality', canRead: true,
      reason: '临时协助首件检验记录复核', grantedBy: admin.id,
      startsAt: fixedNow, expiresAt: new Date('2026-08-20T18:00:00+08:00'),
    } }),
  ])

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
    roleLogins: {
      productionExecutor: { username: operator.username, password: 'GuideOperator123!' },
      productionLead: { username: leadOperator.username, password: 'GuideLead123!' },
      planner: { username: planner.username, password: 'GuidePlanner123!' },
      qualityInspector: { username: inspectorOperator.username, password: 'GuideInspector123!' },
      warehouse: { username: warehouseOperator.username, password: 'GuideWarehouse123!' },
      processEngineer: { username: processOperator.username, password: 'GuideProcess123!' },
      warehouseLead: { username: warehouseLeadOperator.username, password: 'GuideWarehouseLead123!' },
      salesFulfillment: { username: salesOperator.username, password: 'GuideSales123!' },
      personnelManager: { username: personnelOperator.username, password: 'GuidePersonnel123!' },
      permissionAdmin: { username: permissionOperator.username, password: 'GuidePermission123!' },
      aiObserver: { username: aiObserverOperator.username, password: 'GuideAiReader123!' },
    },
    counts: {
      materials: await prisma.material.count(),
      productionOrders: await prisma.productionOrder.count(),
      inventoryLots: await prisma.inventoryLot.count(),
      qualityInspections: await prisma.qualityInspection.count(),
      pendingQualityActual: pendingQualityActual.actualNo,
      traceDraftActual: traceDraftActual.actualNo,
      receivedMaterialIn: receivedMaterialIn.first.inboundNo,
      confirmedFlowTransfer: confirmedFlowTransfer.transferNo,
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
