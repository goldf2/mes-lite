import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-equipment-maintenance-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const read = (path: string) => readFileSync(join(root, path), 'utf8')

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const migration = read('prisma/migrations/20260815150000_add_equipment_maintenance/migration.sql')
  const page = read('modules/equipment/ui/EquipmentMaintenancePageModule.tsx')
  const completion = read('modules/equipment/ui/EquipmentMaintenanceCompleteDialog.tsx')
  const inventoryEntry = read('modules/inventory/index.ts')
  const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  const permissionSource = read('lib/permissions.ts')
  assert.match(page, /AttachmentPanel/, '维修工单必须复用公共附件面板')
  assert.match(completion, /ManyToOneRelationField/, '备件领用必须复用公共关系选择骨架')
  assert.match(inventoryEntry, /consumeAvailableInventoryLotsForReference/, '跨模块批次扣减必须由库存公共入口导出')
  assert.match(registry, /EquipmentMaintenancePageModule/, '设备维保页面必须通过设备领域公开入口注册')
  assert.match(permissionSource, /equipmentMaintenance/, '设备维保必须使用独立细粒度权限资源')
  for (const trigger of [
    'EquipmentMaintenancePlan_validate_insert', 'EquipmentMaintenancePlan_restrict_update',
    'EquipmentMaintenancePlanItem_restrict_update', 'EquipmentMaintenanceWorkOrder_validate_insert',
    'EquipmentMaintenanceWorkOrder_validate_update', 'EquipmentMaintenanceWorkResult_restrict_update',
    'EquipmentMaintenanceSpareUsage_restrict_update',
  ]) assert.match(migration, new RegExp(trigger), `设备维保迁移必须包含数据库约束：${trigger}`)
  for (const routePath of [
    'app/api/equipment-maintenance/route.ts', 'app/api/equipment-maintenance/plans/route.ts',
    'app/api/equipment-maintenance/plans/[id]/work-orders/route.ts',
    'app/api/equipment-maintenance/work-orders/route.ts',
    'app/api/equipment-maintenance/work-orders/[id]/start/route.ts',
    'app/api/equipment-maintenance/work-orders/[id]/complete/route.ts',
  ]) {
    const route = read(routePath)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `${routePath} 必须保持为薄 HTTP 层`)
    assert.match(route, /@\/modules\/equipment\//, `${routePath} 必须委托设备领域服务`)
  }
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { createInventoryLotReceipt },
    {
      createEquipmentMaintenancePlan,
      createPreventiveMaintenanceWorkOrder,
      createCorrectiveMaintenanceWorkOrder,
      startEquipmentMaintenanceWorkOrder,
      completeEquipmentMaintenanceWorkOrder,
    },
    { listEquipmentMaintenanceWorkspace },
    { EquipmentDomainError },
    { DataScopeError, unrestrictedDataScope },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/inventory'),
    import('../modules/equipment/server/equipment-maintenance-command-service'),
    import('../modules/equipment/server/equipment-maintenance-query-service'),
    import('../modules/equipment/domain/equipment-errors'),
    import('../modules/identity-access'),
  ])
  const now = new Date('2026-08-14T08:00:00.000Z')
  const actor = {
    operatorId: 'maintenance-verifier', operatorName: '设备维保验证员',
    auditContext: { operatorId: 'maintenance-verifier', operatorName: '设备维保验证员', ipAddress: undefined, userAgent: undefined },
  }
  try {
    verifyStaticBoundaries()
    const [authorizedCenter, blockedCenter] = await Promise.all([
      prisma.workCenter.create({ data: { code: 'EM-WC-A', name: '维保授权中心' } }),
      prisma.workCenter.create({ data: { code: 'EM-WC-B', name: '维保未授权中心' } }),
    ])
    const [equipment, blockedEquipment] = await Promise.all([
      prisma.equipment.create({ data: { code: 'EM-EQ-A', name: '授权维保设备', equipmentType: '冷镦机', workCenterId: authorizedCenter.id } }),
      prisma.equipment.create({ data: { code: 'EM-EQ-B', name: '未授权维保设备', equipmentType: '冷镦机', workCenterId: blockedCenter.id } }),
    ])
    const location = await prisma.inventoryLocation.create({ data: { code: 'EM-SPARE', name: '维修备件库', isDefault: true } })
    const material = await prisma.material.create({ data: { code: 'EM-SP-01', name: '润滑滤芯', unit: '个', stockUnit: '个', valuationUnit: '个', unitMode: 'SINGLE', conversionRate: 1 } })
    await prisma.$transaction(async (tx) => {
      const receipt = await postInventoryReceipt(tx, {
        materialId: material.id, stockQty: 10, valuationQty: 10, costAmount: 500,
        type: 'VERIFY_RECEIPT', refType: 'VERIFY', refId: 'EM-OPENING', note: '设备维保验证期初',
        locationId: location.id, idempotencyKey: 'EM-OPENING-STOCK', createdBy: actor.operatorName,
      })
      await createInventoryLotReceipt(tx, {
        lotNo: 'EM-SP-LOT-01', materialId: material.id, sourceType: 'VERIFY', sourceId: 'EM-OPENING',
        locationId: location.id, inventoryStatus: 'AVAILABLE', stockQty: 10, valuationQty: 10, costAmount: 500,
        stockLogId: receipt.movement!.id, idempotencyKey: 'EM-OPENING-LOT', note: '设备维保验证批次', createdBy: actor.operatorName,
      })
    })
    const scoped = { ...unrestrictedDataScope, operatorId: actor.operatorId, productionMode: 'WORK_CENTERS' as const, workCenterIds: [authorizedCenter.id], inventoryMode: 'LOCATIONS' as const, locationIds: [location.id] }
    await assert.rejects(
      () => createEquipmentMaintenancePlan({ code: 'EM-BLOCKED', name: '越权计划', equipmentId: blockedEquipment.id, intervalDays: 30, nextDueAt: now, items: [{ name: '润滑系统', standard: '更换滤芯' }] }, actor, scoped),
      (error: unknown) => error instanceof DataScopeError && error.status === 403,
      '工作中心范围外的设备不得建立保养计划',
    )
    const plan = await createEquipmentMaintenancePlan({
      code: ' em monthly 01 ', name: ' 月度润滑保养 ', equipmentId: equipment.id, intervalDays: 30,
      nextDueAt: now, note: '每月首班执行', items: [{ name: '润滑系统', standard: '更换滤芯并确认无泄漏' }],
    }, actor, scoped)
    assert.deepEqual([plan.code, plan.items.length, plan.items[0].sortOrder], ['EMMONTHLY01', 1, 1], '保养计划必须规范编码并冻结有序项目')
    assert.equal((await listEquipmentMaintenanceWorkspace({ filter: 'DUE', now }, scoped)).counts.duePlans, 1, '到期保养必须进入工作中心任务')

    const createOperationId = crypto.randomUUID()
    const generated = await createPreventiveMaintenanceWorkOrder(plan.id, { operationId: createOperationId, assignedTo: '设备组' }, actor, scoped, now)
    const duplicateGenerated = await createPreventiveMaintenanceWorkOrder(plan.id, { operationId: createOperationId, assignedTo: '设备组' }, actor, scoped, now)
    assert.equal(duplicateGenerated.duplicate, true, '相同幂等标识不得重复生成保养工单')
    await assert.rejects(
      () => createPreventiveMaintenanceWorkOrder(plan.id, { operationId: crypto.randomUUID() }, actor, scoped, now),
      (error: unknown) => error instanceof EquipmentDomainError && error.status === 409,
      '同一计划同一应保周期只能生成一张有效工单',
    )
    const started = await startEquipmentMaintenanceWorkOrder(generated.workOrder.id, actor, scoped, now)
    assert.equal(started.workOrder.status, 'IN_PROGRESS')
    assert.equal((await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.id } })).status, 'MAINTENANCE', '开始工单必须通过设备事件进入维修状态')

    const completionOperationId = crypto.randomUUID()
    const completed = await completeEquipmentMaintenanceWorkOrder(generated.workOrder.id, {
      operationId: completionOperationId, completedAt: now, workDescription: '已更换滤芯并试机确认', failureCause: null,
      items: plan.items.map((item) => ({ planItemId: item.id, result: 'PASS' as const, note: '正常' })),
      spares: [{ materialId: material.id, locationId: location.id, stockQty: 2, note: '更换两只滤芯' }],
    }, actor, scoped, now)
    assert.equal(completed.workOrder.status, 'COMPLETED')
    const duplicateCompleted = await completeEquipmentMaintenanceWorkOrder(generated.workOrder.id, {
      operationId: completionOperationId, completedAt: now, workDescription: '重复提交', items: [], spares: [],
    }, actor, scoped, now)
    assert.equal(duplicateCompleted.duplicate, true, '相同完成幂等标识不得重复扣减备件')
    const [savedEquipment, savedPlan, stock, balance, movement, lotTransaction] = await Promise.all([
      prisma.equipment.findUniqueOrThrow({ where: { id: equipment.id } }),
      prisma.equipmentMaintenancePlan.findUniqueOrThrow({ where: { id: plan.id } }),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.stockLocationBalance.findUniqueOrThrow({ where: { stockId_locationId: { stockId: (await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })).id, locationId: location.id } } }),
      prisma.stockLog.findUniqueOrThrow({ where: { idempotencyKey: `EQUIPMENT_MAINTENANCE:${generated.workOrder.id}:SPARE:${material.id}:${location.id}` } }),
      prisma.inventoryLotTransaction.findFirstOrThrow({ where: { refType: 'EQUIPMENT_MAINTENANCE_SPARE', refId: completed.workOrder.spares[0].id } }),
    ])
    assert.deepEqual([savedEquipment.status, stock.qty, balance.qty, movement.qty], ['AVAILABLE', 8, 8, -2], '工单完成必须原子恢复设备并扣减总库存、库位库存和流水')
    assert.equal(lotTransaction.stockQty, -2, '备件出库必须同步扣减可追溯批次')
    assert.equal(savedPlan.nextDueAt.toISOString(), '2026-09-13T08:00:00.000Z', '保养完成必须从应保时间推进下一周期')
    assert.equal(await prisma.equipmentMaintenanceSpareUsage.count(), 1, '重复完成不得重复生成备件领用')
    await assert.rejects(() => prisma.equipmentMaintenanceSpareUsage.update({ where: { id: completed.workOrder.spares[0].id }, data: { stockQty: 99 } }), '数据库必须拒绝篡改已过账备件领用')

    const repair = await createCorrectiveMaintenanceWorkOrder({
      operationId: crypto.randomUUID(), equipmentId: equipment.id, title: '主轴异响维修', priority: 'HIGH', faultDescription: '主轴运行时连续异响', assignedTo: '设备组', dueAt: now,
    }, actor, scoped, now)
    assert.equal((await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.id } })).status, 'FAULT', '新建故障维修工单必须联动故障事件')
    await startEquipmentMaintenanceWorkOrder(repair.workOrder.id, actor, scoped, now)
    const repaired = await completeEquipmentMaintenanceWorkOrder(repair.workOrder.id, {
      operationId: crypto.randomUUID(), completedAt: now, workDescription: '紧固联轴器并试车', failureCause: '联轴器紧固件松动', items: [], spares: [],
    }, actor, scoped, now)
    assert.equal(repaired.workOrder.status, 'COMPLETED')
    assert.equal((await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.id } })).status, 'AVAILABLE')
    assert.equal(await prisma.auditLog.count({ where: { entityType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER' } }), 6, '创建、开始和完成工单必须留下可信审计')
    console.log('设备维保验证通过：计划、工单、数据范围、设备状态、幂等、备件库存/成本/批次流水和审计均形成闭环。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); rmSync(verifyRoot, { recursive: true, force: true }); process.exit(1) })
