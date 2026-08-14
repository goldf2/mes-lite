import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-role-tasks-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const read = (path: string) => readFileSync(join(root, path), 'utf8')

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { ensureDefaultPermissions, getEffectivePermissionMap, hasResourcePermission },
    { buildRoleTaskSections },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/permissions'),
    import('../modules/workspace/model/role-task-view'),
  ])

  try {
    await ensureDefaultPermissions()
    const requiredGroups = [
      'base_access',
      'production_executor',
      'production_lead',
      'warehouse_executor',
      'quality_inspector',
      'quality_disposition',
      'quality_release',
      'production_planner',
      'equipment_maintenance',
      'system_admin',
    ]
    const groups = await prisma.permissionGroup.findMany({
      where: { code: { in: requiredGroups } },
      include: { settings: true },
    })
    assert.deepEqual(groups.map((group) => group.code).sort(), [...requiredGroups].sort(), '岗位预置权限组必须齐全')

    const groupByCode = new Map(groups.map((group) => [group.code, group]))
    const createJobOperator = async (code: string) => {
      const base = groupByCode.get('base_access')!
      const job = groupByCode.get(code)!
      return prisma.operator.create({
        data: {
          username: `VERIFY-${code}`,
          passwordHash: 'permission-test',
          name: code,
          role: 'OPERATOR',
          status: 'ACTIVE',
          permissionGroups: { create: [{ groupId: base.id }, { groupId: job.id }] },
        },
      })
    }

    const [executor, lead, warehouse, quality, qualityEngineer, planner, maintainer] = await Promise.all([
      createJobOperator('production_executor'),
      createJobOperator('production_lead'),
      createJobOperator('warehouse_executor'),
      createJobOperator('quality_inspector'),
      createJobOperator('quality_disposition'),
      createJobOperator('production_planner'),
      createJobOperator('equipment_maintenance'),
    ])

    assert.equal(await hasResourcePermission(executor, 'orders', 'update'), false, '生产执行人员不获得订单通用更新')
    assert.equal(await hasResourcePermission(executor, 'productionActualEntry', 'update'), true, '生产执行人员可登记实绩草稿')
    assert.equal(await hasResourcePermission(executor, 'productionOrderRelease', 'update'), false, '生产执行人员不得发布订单')
    assert.equal(await hasResourcePermission(executor, 'productionActualConfirm', 'update'), false, '生产执行人员不得确认过账')
    assert.equal(await hasResourcePermission(executor, 'productionActualReverse', 'update'), false, '生产执行人员不得冲销')

    assert.equal(await hasResourcePermission(lead, 'productionOrderRelease', 'update'), true, '生产主管可发布订单')
    assert.equal(await hasResourcePermission(lead, 'productionActualConfirm', 'update'), true, '生产主管可确认过账')
    assert.equal(await hasResourcePermission(lead, 'productionActualReverse', 'update'), true, '生产主管可执行受控冲销')

    assert.equal(await hasResourcePermission(planner, 'productionOrderRelease', 'update'), true, '计划员可发布生产订单')
    assert.equal(await hasResourcePermission(planner, 'productionActualEntry', 'update'), false, '计划员不得登记现场实绩')
    assert.equal(await hasResourcePermission(planner, 'productionActualConfirm', 'update'), false, '计划员不得确认实绩过账')
    assert.equal(await hasResourcePermission(planner, 'productionActualReverse', 'update'), false, '计划员不得冲销实绩')

    assert.equal(await hasResourcePermission(warehouse, 'materialIn', 'update'), true, '仓管可执行来料作业')
    assert.equal(await hasResourcePermission(warehouse, 'orders', 'update'), false, '仓管不得执行生产实绩')
    assert.equal(await hasResourcePermission(quality, 'qualityDecision', 'update'), true, '质检员可记录质量判定')
    assert.equal(await hasResourcePermission(quality, 'qualityDisposition', 'update'), false, '质检员不自动获得返工报废处置')
    assert.equal(await hasResourcePermission(quality, 'qualityRelease', 'update'), false, '质检员不自动获得授权放行')
    assert.equal(await hasResourcePermission(quality, 'qualityStandards', 'read'), true, '质检员可读取已发布检验标准')
    assert.equal(await hasResourcePermission(quality, 'qualityStandards', 'update'), false, '质检员不得修改检验标准')
    assert.equal(await hasResourcePermission(quality, 'quality', 'update'), true, '质检员可为授权质量任务维护附件')
    assert.equal(await hasResourcePermission(qualityEngineer, 'qualityStandards', 'create'), true, '质量工程师可创建检验标准版本')
    assert.equal(await hasResourcePermission(qualityEngineer, 'qualityStandards', 'update'), true, '质量工程师可发布或停用检验标准')

    const taskView = {
      draftOrderCount: 2,
      executableOrderCount: 3,
      pendingProductionActualCount: 4,
      pendingQualityInspectionCount: 5,
      qualityDispositionCount: 6,
      dueEquipmentInspectionCount: 7,
      dueEquipmentMaintenanceCount: 12,
      openEquipmentMaintenanceCount: 13,
      pendingMaterialInCount: 8,
      pendingShipmentCount: 9,
      pendingReturnCount: 10,
      pendingOperatorCount: 11,
    }
    const executorTasks = buildRoleTaskSections(taskView, await getEffectivePermissionMap(executor)).flatMap((section) => section.items)
    assert.ok(executorTasks.some((item) => item.key === 'production-entry'), '生产执行工作台必须显示可登记实绩订单')
    assert.ok(!executorTasks.some((item) => item.key === 'order-release'), '生产执行工作台不得显示待发布命令')
    assert.ok(!executorTasks.some((item) => item.key === 'actual-confirm'), '生产执行工作台不得显示待确认过账')

    const leadTasks = buildRoleTaskSections(taskView, await getEffectivePermissionMap(lead)).flatMap((section) => section.items)
    assert.ok(leadTasks.some((item) => item.key === 'order-release' && item.value === 2), '生产主管必须看到待发布订单')
    assert.ok(leadTasks.some((item) => item.key === 'actual-confirm' && item.value === 4), '生产主管必须看到待确认实绩')

    const warehouseTasks = buildRoleTaskSections(taskView, await getEffectivePermissionMap(warehouse)).flatMap((section) => section.items)
    assert.deepEqual(warehouseTasks.map((item) => item.key), ['material-in', 'shipment', 'return'], '仓库工作台只显示授权收发退任务')

    const qualityTasks = buildRoleTaskSections(taskView, await getEffectivePermissionMap(quality)).flatMap((section) => section.items)
    assert.ok(qualityTasks.some((item) => item.key === 'quality-pending' && item.value === 5), '质量工作台必须显示待检任务')
    assert.ok(!qualityTasks.some((item) => item.key === 'quality-disposition'), '质检员工作台不得显示未授权处置待办')

    const maintenanceTasks = buildRoleTaskSections(taskView, await getEffectivePermissionMap(maintainer)).flatMap((section) => section.items)
    assert.ok(maintenanceTasks.some((item) => item.key === 'equipment-maintenance-due' && item.value === 12), '设备维护工作台必须显示到期保养')
    assert.ok(maintenanceTasks.some((item) => item.key === 'equipment-maintenance-open' && item.value === 13), '设备维护工作台必须显示待办维保工单')

    assert.match(read('app/api/orders/[id]/confirm/route.ts'), /requireResourcePermission\('productionOrderRelease', 'update'\)/, '订单发布 API 必须使用独立权限')
    assert.match(read('app/api/orders/[id]/actuals/route.ts'), /requireResourcePermission\('productionActualEntry', 'update'\)/, '实绩登记 API 必须使用独立权限')
    assert.match(read('app/api/orders/[id]/actuals/[actualId]/confirm/route.ts'), /requireResourcePermission\('productionActualConfirm', 'update'\)/, '实绩确认 API 必须使用独立权限')
    assert.match(read('app/api/orders/[id]/actuals/[actualId]/reverse/route.ts'), /requireResourcePermission\('productionActualReverse', 'update'\)/, '实绩冲销 API 必须使用独立权限')

    console.log('岗位任务与生产命令权限验证通过：岗位预置组、待办可见性和三层服务端门禁符合最小权限。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
