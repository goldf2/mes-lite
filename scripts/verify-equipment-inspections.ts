import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-equipment-inspections-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const read = (path: string) => readFileSync(join(root, path), 'utf8')

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const migration = read('prisma/migrations/20260815120000_add_equipment_inspections/migration.sql')
  const page = read('modules/equipment/ui/EquipmentInspectionPageModule.tsx')
  const planDialog = read('modules/equipment/ui/EquipmentInspectionPlanDialog.tsx')
  const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  const permissionSource = read('lib/permissions.ts')
  assert.match(page, /AttachmentPanel/, '点检记录必须复用公共附件面板')
  assert.match(planDialog, /ManyToOneRelationField/, '点检计划选设备必须复用公共关系编辑骨架')
  assert.match(registry, /EquipmentInspectionPageModule/, '点检页面必须通过设备领域公开入口注册')
  assert.match(permissionSource, /equipmentInspections/, '点检必须使用独立细粒度权限资源')
  for (const trigger of [
    'EquipmentInspectionPlan_validate_insert', 'EquipmentInspectionPlan_restrict_update', 'EquipmentInspectionPlan_prevent_delete',
    'EquipmentInspectionPlanItem_restrict_update', 'EquipmentInspectionRecord_validate_insert', 'EquipmentInspectionRecord_restrict_update',
    'EquipmentInspectionResult_validate_insert', 'EquipmentInspectionResult_validate_record_completion',
  ]) assert.match(migration, new RegExp(trigger), `点检迁移必须包含数据库约束：${trigger}`)
  for (const routePath of [
    'app/api/equipment-inspections/route.ts', 'app/api/equipment-inspections/[id]/route.ts',
    'app/api/equipment-inspections/[id]/complete/route.ts',
  ]) {
    const route = read(routePath)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `${routePath} 必须保持为薄 HTTP 层`)
    assert.match(route, /@\/modules\/equipment\//, `${routePath} 必须委托设备领域服务`)
  }
}

async function main() {
  const [
    { prisma },
    { createEquipmentInspectionPlan, changeEquipmentInspectionPlanStatus, completeEquipmentInspection },
    { listEquipmentInspectionWorkspace },
    { EquipmentDomainError },
    { DataScopeError, unrestrictedDataScope },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/equipment/server/equipment-inspection-command-service'),
    import('../modules/equipment/server/equipment-inspection-query-service'),
    import('../modules/equipment/domain/equipment-errors'),
    import('../modules/identity-access'),
  ])
  const actor = {
    operatorId: 'inspection-verifier', operatorName: '点检验证员',
    auditContext: { operatorId: 'inspection-verifier', operatorName: '点检验证员', ipAddress: undefined, userAgent: undefined },
  }
  const now = new Date('2026-08-14T08:00:00.000Z')
  try {
    verifyStaticBoundaries()
    const [authorizedCenter, blockedCenter] = await Promise.all([
      prisma.workCenter.create({ data: { code: 'EI-WC-A', name: '点检授权中心' } }),
      prisma.workCenter.create({ data: { code: 'EI-WC-B', name: '点检未授权中心' } }),
    ])
    const [equipment, blockedEquipment] = await Promise.all([
      prisma.equipment.create({ data: { code: 'EI-EQ-A', name: '授权点检设备', equipmentType: '冷镦机', workCenterId: authorizedCenter.id } }),
      prisma.equipment.create({ data: { code: 'EI-EQ-B', name: '未授权点检设备', equipmentType: '冷镦机', workCenterId: blockedCenter.id } }),
    ])
    const scoped = { ...unrestrictedDataScope, operatorId: 'inspection-verifier', productionMode: 'WORK_CENTERS' as const, workCenterIds: [authorizedCenter.id] }
    await assert.rejects(
      () => createEquipmentInspectionPlan({ code: 'EI-BLOCKED', name: '越权计划', equipmentId: blockedEquipment.id, intervalDays: 1, nextDueAt: now, items: [{ name: '润滑', standard: '油位正常' }] }, actor, scoped),
      (error: unknown) => error instanceof DataScopeError && error.status === 403,
      '工作中心范围外的设备不得建立点检计划',
    )
    const plan = await createEquipmentInspectionPlan({
      code: ' ei daily 01 ', name: ' 每日安全点检 ', equipmentId: equipment.id,
      intervalDays: 1, nextDueAt: now, note: '班前执行',
      items: [
        { name: '润滑油位', standard: '位于上下限之间', unit: 'mm' },
        { name: '防护门', standard: '关闭且联锁有效' },
      ],
    }, actor, scoped)
    assert.deepEqual([plan.code, plan.items.length, plan.items[0].sortOrder], ['EIDAILY01', 2, 1], '计划必须规范编码并保存有序检查清单')
    assert.equal((await listEquipmentInspectionWorkspace({ filter: 'DUE', now }, scoped)).plans.length, 1, '到期计划必须进入当前工作中心任务')
    assert.equal((await listEquipmentInspectionWorkspace({ filter: 'DUE', now }, { ...scoped, workCenterIds: [blockedCenter.id] })).plans.length, 0, '点检查询必须按工作中心范围过滤')

    const paused = await changeEquipmentInspectionPlanStatus(plan.id, 'PAUSE', actor, scoped, now)
    assert.equal(paused.saved.status, 'PAUSED')
    await assert.rejects(() => completeEquipmentInspection(plan.id, {
      operationId: crypto.randomUUID(), inspectedAt: now, items: plan.items.map((item) => ({ planItemId: item.id, result: 'PASS' as const })),
    }, actor, scoped, now), (error: unknown) => error instanceof EquipmentDomainError && error.status === 409, '暂停计划不得执行')
    const resumed = await changeEquipmentInspectionPlanStatus(plan.id, 'RESUME', actor, scoped, now)
    assert.equal(resumed.saved.status, 'ACTIVE')

    await assert.rejects(() => completeEquipmentInspection(plan.id, {
      operationId: crypto.randomUUID(), inspectedAt: now,
      items: [{ planItemId: plan.items[0].id, result: 'PASS' }],
    }, actor, scoped, now), /必须逐项提交/, '点检不得缺项')
    await assert.rejects(() => completeEquipmentInspection(plan.id, {
      operationId: crypto.randomUUID(), inspectedAt: now,
      items: plan.items.map((item, index) => ({ planItemId: item.id, result: index === 0 ? 'FAIL' as const : 'PASS' as const })),
    }, actor, scoped, now), /异常点检项目必须填写异常说明/, '异常项目必须说明原因')

    const operationId = crypto.randomUUID()
    const abnormal = await completeEquipmentInspection(plan.id, {
      operationId, inspectedAt: now, note: '停机排查',
      items: plan.items.map((item, index) => ({ planItemId: item.id, actualValue: index === 0 ? '低于下限' : '正常', result: index === 0 ? 'FAIL' : 'PASS', note: index === 0 ? '润滑油不足' : null })),
    }, actor, scoped, now)
    assert.deepEqual([abnormal.record.result, abnormal.record.items.length, abnormal.duplicate], ['ABNORMAL', 2, false], '异常点检必须保存主记录和全部结果快照')
    const [savedEquipment, faultEvent, updatedPlan] = await Promise.all([
      prisma.equipment.findUniqueOrThrow({ where: { id: equipment.id } }),
      prisma.equipmentEvent.findUniqueOrThrow({ where: { id: abnormal.faultEventId! } }),
      prisma.equipmentInspectionPlan.findUniqueOrThrow({ where: { id: plan.id } }),
    ])
    assert.deepEqual([savedEquipment.status, faultEvent.eventType, faultEvent.operatorName], ['FAULT', 'FAULT', '点检验证员'], '异常点检必须在同一事务联动可信故障事件')
    assert.equal(updatedPlan.nextDueAt.toISOString(), '2026-08-15T08:00:00.000Z', '完成后必须推进下次到期时间')
    const duplicate = await completeEquipmentInspection(plan.id, {
      operationId, inspectedAt: now,
      items: plan.items.map((item) => ({ planItemId: item.id, result: 'PASS' })),
    }, actor, scoped, now)
    assert.equal(duplicate.duplicate, true, '相同点检幂等标识不得重复写记录或事件')
    assert.equal(await prisma.equipmentInspectionRecord.count(), 1)
    assert.equal(await prisma.equipmentEvent.count({ where: { equipmentId: equipment.id, eventType: 'FAULT' } }), 1)
    await assert.rejects(() => prisma.equipmentInspectionRecord.update({ where: { id: abnormal.record.id }, data: { note: '篡改' } }), '数据库必须拒绝篡改点检记录')
    await assert.rejects(() => prisma.equipmentInspectionResult.delete({ where: { id: abnormal.record.items[0].id } }), '数据库必须拒绝删除点检结果')
    assert.equal(await prisma.auditLog.count({ where: { entityType: 'EQUIPMENT_INSPECTION_RECORD' } }), 1, '完成点检必须在事务内留下可信审计')
    console.log('设备点检验证通过：计划、工作中心范围、完整清单、幂等、异常故障联动、不可变记录与审计均符合闭环。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); rmSync(verifyRoot, { recursive: true, force: true }); process.exit(1) })
