import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-production-actual-context-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { createProductionOrderActualSchema },
    { createProductionOrderActual, getProductionOrderActualWorkspace },
    { confirmProductionOrderActual },
    { recordEquipmentEvent },
    { postInventoryReceipt },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/production/contracts/production-order-actual-schema'),
    import('../modules/production/server/production-order-actual-service'),
    import('../modules/production/server/production-order-actual-status-service'),
    import('../modules/equipment/server/equipment-event-service'),
    import('../lib/inventory'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [orderCenter, otherCenter] = await Promise.all([
      prisma.workCenter.create({ data: { code: `WC-A-${suffix}`, name: '订单工作中心' } }),
      prisma.workCenter.create({ data: { code: `WC-B-${suffix}`, name: '其它工作中心' } }),
    ])
    const [validEquipment, faultEquipment, otherEquipment] = await Promise.all([
      prisma.equipment.create({ data: { code: `EQ-A-${suffix}`, name: '订单机台', equipmentType: '冷镦机', model: 'CF-100', workCenterId: orderCenter.id } }),
      prisma.equipment.create({ data: { code: `EQ-F-${suffix}`, name: '故障机台', equipmentType: '冷镦机', workCenterId: orderCenter.id } }),
      prisma.equipment.create({ data: { code: `EQ-B-${suffix}`, name: '其它机台', equipmentType: '车床', workCenterId: otherCenter.id } }),
    ])
    const actor = { operatorId: 'verify-context', operatorName: '上下文验证员' }
    await recordEquipmentEvent(faultEquipment.id, { action: 'START', reason: '验证启动' }, actor)
    await recordEquipmentEvent(faultEquipment.id, { action: 'FAULT', reason: '验证故障' }, actor)

    const [raw, finished, unrelatedMaterial, employee, location, category] = await Promise.all([
      prisma.material.create({ data: { code: `RAW-${suffix}`, name: '验证原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' } }),
      prisma.material.create({ data: { code: `FIN-${suffix}`, name: '验证成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.material.create({ data: { code: `OTHER-${suffix}`, name: '无关产品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' } }),
      prisma.employee.create({ data: { code: `EMP-${suffix}`, name: '生产验证员' } }),
      prisma.inventoryLocation.create({ data: { code: `LOC-${suffix}`, name: '验证库位', isDefault: true } }),
      prisma.documentCategory.create({ data: { name: `验证作业文件-${suffix}` } }),
    ])
    const product = await prisma.product.create({
      data: { sku: `SKU-${suffix}`, materialId: finished.id, name: finished.name, category: 'FINISHED', unit: '件' },
    })
    await prisma.processRoute.create({
      data: {
        productId: product.id,
        materialId: finished.id,
        name: '验证默认路线',
        isDefault: true,
        steps: { create: { stepNo: 10, name: '冷镦', workCenterId: orderCenter.id } },
      },
    })
    const draftBom = await prisma.bOM.create({
      data: {
        productId: product.id,
        materialId: finished.id,
        name: '上下文验证 BOM',
        version: 'v1',
        outputQuantity: 1,
        outputUnit: '件',
        items: { create: { materialId: raw.id, quantity: 1, unit: 'kg' } },
        outputs: { create: { materialId: finished.id, quantity: 1, unit: '件', isPrimary: true } },
      },
    })
    const bom = await prisma.bOM.update({
      where: { id: draftBom.id },
      data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
      include: {
        items: { include: { material: { select: { code: true, name: true, stockUnit: true, unit: true } } } },
        outputs: { include: { material: { select: { code: true, name: true, stockUnit: true, unit: true } } } },
      },
    })
    const order = await prisma.productionOrder.create({
      data: {
        orderNo: `WO-${suffix}`,
        productId: product.id,
        materialId: finished.id,
        bomId: bom.id,
        bomName: bom.name,
        bomVersion: bom.version,
        bomSnapshot: JSON.stringify(bom),
        planQty: 10,
        status: 'RELEASED',
      },
    })
    const [validInstruction, otherInstruction, draftInstruction] = await Promise.all([
      prisma.workInstruction.create({
        data: {
          categoryId: category.id,
          title: '冷镦首件作业指导书',
          version: 'v3',
          materialId: finished.id,
          contentJson: '{"type":"doc","content":[]}',
          contentText: '装模后完成首件确认。',
        },
      }),
      prisma.workInstruction.create({
        data: {
          categoryId: category.id,
          title: '无关产品作业文件',
          materialId: unrelatedMaterial.id,
        },
      }),
      prisma.workInstruction.create({
        data: {
          categoryId: category.id,
          title: '未生效文件',
          status: 'DRAFT',
          materialId: finished.id,
        },
      }),
    ])
    await prisma.documentAttachment.create({
      data: {
        ownerType: 'WORK_INSTRUCTION', ownerId: validInstruction.id, originalName: '冷镦首件-v3.pdf',
        fileName: 'verify.pdf', mimeType: 'application/pdf', size: 128, url: '/api/attachments/verify/file',
        storagePath: '/tmp/verify-production-actual-context.pdf', uploadedBy: '上下文验证员',
      },
    })
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: raw.id,
      stockQty: 20,
      valuationQty: 20,
      costAmount: 200,
      type: 'VERIFY_IN',
      refType: 'VERIFY',
      refId: 'production-actual-context',
      note: '生产实绩执行上下文验证期初库存',
      locationId: location.id,
    }))

    const workspace = await getProductionOrderActualWorkspace(order.id)
    assert.deepEqual(workspace.executionContext.workCenterIds, [orderCenter.id], '实绩候选必须从派工/默认路线解析订单工作中心')
    assert.deepEqual(workspace.executionContext.equipment.map((item) => item.id), [validEquipment.id], '候选设备必须排除其它中心和故障设备')
    assert.deepEqual(workspace.executionContext.workInstructions.map((item) => item.id), [validInstruction.id], '候选文件必须只包含适用且已生效版本')
    assert.equal(workspace.executionContext.workInstructions[0].attachments[0]?.originalName, '冷镦首件-v3.pdf', '候选文件应说明当前附件版本')

    const baseInput = {
      actualDate: '2026-08-15',
      employeeIds: [employee.id],
      equipmentIds: [validEquipment.id],
      workInstructionIds: [validInstruction.id],
      inputs: [{ materialId: raw.id, locationId: location.id, lossMode: 'PERCENT' as const, lossValue: 0, actualQty: 2 }],
      outputs: [{ materialId: finished.id, locationId: location.id, actualQty: 2 }],
    }
    assert.equal(createProductionOrderActualSchema.safeParse({ ...baseInput, equipmentIds: [], workInstructionIds: [] }).success, false, '设备和作业文件均缺失时必须要求填写两类例外原因')
    assert.equal(createProductionOrderActualSchema.safeParse({ ...baseInput, equipmentIds: [validEquipment.id, validEquipment.id] }).success, false, '实绩不得重复选择同一设备')

    await assert.rejects(
      () => createProductionOrderActual(order.id, { ...baseInput, equipmentIds: [otherEquipment.id] }),
      /设备不属于订单工作中心|所选设备不可用于当前生产订单/,
      '服务端必须拒绝伪造其它工作中心设备 ID',
    )
    await assert.rejects(
      () => createProductionOrderActual(order.id, { ...baseInput, equipmentIds: [faultEquipment.id] }),
      /设备状态不可用于生产|所选设备不可用于当前生产订单/,
      '服务端必须拒绝故障设备',
    )
    await assert.rejects(
      () => createProductionOrderActual(order.id, { ...baseInput, workInstructionIds: [otherInstruction.id] }),
      /作业文件不适用于当前生产订单|所选作业文件不可用于当前生产订单/,
      '服务端必须拒绝无关作业文件 ID',
    )
    await assert.rejects(
      () => createProductionOrderActual(order.id, { ...baseInput, workInstructionIds: [draftInstruction.id] }),
      /作业文件尚未生效|所选作业文件不可用于当前生产订单/,
      '服务端必须拒绝草稿作业文件',
    )

    const actual = await createProductionOrderActual(order.id, baseInput)
    assert.equal(actual.equipmentSnapshots[0].equipmentCode, validEquipment.code)
    assert.equal(actual.equipmentSnapshots[0].equipmentName, '订单机台')
    assert.equal(actual.equipmentSnapshots[0].workCenterName, orderCenter.name)
    assert.equal(actual.workInstructionSnapshots[0].title, validInstruction.title)
    assert.equal(actual.workInstructionSnapshots[0].version, 'v3')
    assert.equal('contentText' in actual.workInstructionSnapshots[0], false, '工作区列表不得下发完整历史正文')
    assert.match(actual.workInstructionSnapshots[0].attachmentsJson, /冷镦首件-v3\.pdf/)

    await Promise.all([
      prisma.equipment.update({ where: { id: validEquipment.id }, data: { name: '来源设备已改名' } }),
      prisma.workInstruction.update({ where: { id: validInstruction.id }, data: { version: 'v4', contentText: '来源正文已修改。' } }),
    ])
    const frozen = await prisma.productionOrderActual.findUniqueOrThrow({
      where: { id: actual.id },
      include: { equipmentSnapshots: true, workInstructionSnapshots: true },
    })
    assert.deepEqual(
      [frozen.equipmentSnapshots[0].equipmentName, frozen.workInstructionSnapshots[0].version, frozen.workInstructionSnapshots[0].contentText],
      ['订单机台', 'v3', '装模后完成首件确认。'],
      '来源资料修改不得改变实绩快照',
    )

    const exceptionActual = await createProductionOrderActual(order.id, {
      ...baseInput,
      equipmentIds: [],
      workInstructionIds: [],
      equipmentExceptionReason: '手工作业台，无独立设备编号',
      workInstructionExceptionReason: '临时返工作业，按现场签字参数执行',
    })
    assert.equal(exceptionActual.equipmentSnapshots.length, 0)
    assert.equal(exceptionActual.equipmentExceptionReason, '手工作业台，无独立设备编号')
    assert.equal(exceptionActual.workInstructionExceptionReason, '临时返工作业，按现场签字参数执行')

    const bypassActual = await prisma.productionOrderActual.create({
      data: { actualNo: `PA-BYPASS-${suffix}`, orderId: order.id, actualDate: new Date(), workers: '旁路验证员' },
    })
    await assert.rejects(
      () => confirmProductionOrderActual(order.id, bypassActual.id, '旁路确认员'),
      /必须选择实际设备或填写设备例外原因/,
      '确认服务必须在库存操作前复检执行上下文',
    )
    await assert.rejects(
      () => prisma.productionOrderActual.update({ where: { id: bypassActual.id }, data: { status: 'CONFIRMED' } }),
      '数据库必须拒绝绕过服务确认缺少设备上下文的实绩',
    )

    await prisma.productionOrderActual.update({ where: { id: actual.id }, data: { status: 'CONFIRMED' } })
    await assert.rejects(
      () => prisma.productionOrderActualEquipment.update({ where: { id: frozen.equipmentSnapshots[0].id }, data: { equipmentName: '篡改机台' } }),
      '已确认设备快照必须不可修改',
    )
    await assert.rejects(
      () => prisma.productionOrderActualWorkInstruction.delete({ where: { id: frozen.workInstructionSnapshots[0].id } }),
      '已确认作业文件快照必须不可删除',
    )
    await assert.rejects(
      () => prisma.productionOrderActual.update({ where: { id: actual.id }, data: { equipmentExceptionReason: '事后补写' } }),
      '已确认实绩的例外原因必须不可修改',
    )

    console.log('生产实绩执行上下文验证通过：候选过滤、设备/文件快照、例外原因、来源漂移隔离、确认必填和数据库不可变约束符合预期。')
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
