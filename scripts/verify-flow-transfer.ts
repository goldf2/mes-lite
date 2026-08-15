import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-flow-transfer-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredModuleFiles = [
    'modules/production/client/flow-transfer-api.ts',
    'modules/production/contracts/flow-transfer.ts',
    'modules/production/contracts/flow-transfer-schema.ts',
    'modules/production/domain/flow-transfer-errors.ts',
    'modules/production/domain/flow-transfer-numbering.ts',
    'modules/production/domain/flow-transfer-status.ts',
    'modules/production/model/flow-transfer-view.ts',
    'modules/production/server/flow-transfer-query-service.ts',
    'modules/production/server/flow-transfer-command-service.ts',
    'modules/production/server/flow-transfer-status-service.ts',
    'modules/production/ui/FlowTransferPageModule.tsx',
  ]
  for (const path of requiredModuleFiles) assert.ok(existsSync(join(root, path)), `生产领域缺少流程转移模块文件：${path}`)
  assert.equal(existsSync(join(root, 'lib/flow-transfer.ts')), false, '流程转移规则不得回流扁平 lib helper')

  const pageSource = read('modules/production/ui/FlowTransferPageModule.tsx')
  const registrySource = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  assert.ok(pageSource.split('\n').length <= 520, '流程转移协调页应保持在 520 行内')
  assert.doesNotMatch(pageSource, /\bfetch\(/, '流程转移页不得直接调用 fetch')
  assert.match(pageSource, /loadFlowTransfers\(/, '流程转移页必须通过生产领域 client 读取数据')
  assert.match(registrySource, /FlowTransferPageModule/, '流程转移页必须通过生产模块公开入口加载')

  const routes = [
    'app/api/flow-transfers/route.ts',
    'app/api/flow-transfers/[id]/route.ts',
    'app/api/flow-transfers/[id]/confirm/route.ts',
    'app/api/flow-transfers/[id]/reverse/route.ts',
  ]
  for (const routePath of routes) {
    const route = read(routePath)
    assert.ok(route.split('\n').length <= 100, `流程转移 API 必须保持不超过 100 行：${routePath}`)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `流程转移 API 不得直接访问 Prisma：${routePath}`)
    assert.match(route, /@\/modules\/production\//, `流程转移 API 必须委托生产领域：${routePath}`)
  }
  const services = requiredModuleFiles.filter((file) => file.includes('/server/')).map(read).join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '流程转移领域服务不得依赖 HTTP、权限或请求审计')
}

async function main() {
  const [
    { prisma },
    { postInventoryReceipt },
    { flowTransferInputSchema },
    { FlowTransferDomainError },
    { nextFlowTransferNumber, parseFlowTransferDate },
    { flowTransferTransitionError },
    { createManagedFlowTransfer, updateManagedFlowTransfer },
    { loadManagedFlowTransferWorkspace },
    { confirmManagedFlowTransfer, reverseManagedFlowTransfer },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/inventory'),
    import('../modules/production/contracts/flow-transfer-schema'),
    import('../modules/production/domain/flow-transfer-errors'),
    import('../modules/production/domain/flow-transfer-numbering'),
    import('../modules/production/domain/flow-transfer-status'),
    import('../modules/production/server/flow-transfer-command-service'),
    import('../modules/production/server/flow-transfer-query-service'),
    import('../modules/production/server/flow-transfer-status-service'),
  ])
  try {
    verifyStaticBoundaries()
    const fixedNow = new Date('2026-08-03T08:00:00.000Z')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [source, target] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `SOURCE-${suffix}`, name: '待检库位' } }),
      prisma.inventoryLocation.create({ data: { code: `TARGET-${suffix}`, name: '合格库位' } }),
    ])
    const [material, employee] = await Promise.all([
      prisma.material.create({
        data: {
          code: `FLOW-${suffix}`, name: '流程转移验证物料', category: 'FINISHED',
          unit: '件', stockUnit: '件', valuationUnit: 'kg', conversionRate: 0.5,
        },
      }),
      prisma.employee.create({ data: { code: `EMP-${suffix}`, name: '验证员' } }),
    ])
    await prisma.$transaction((tx) => postInventoryReceipt(tx, {
      materialId: material.id, stockQty: 100, valuationQty: 50, costAmount: 500,
      type: 'VERIFY_IN', refType: 'VERIFY', refId: 'opening', note: '验证期初入库', locationId: source.id,
    }))
    await prisma.flowTransfer.create({
      data: {
        transferNo: 'FT-20260803-009', transferDate: parseFlowTransferDate('2026-08-03'),
        materialId: material.id, sourceLocationId: source.id, targetLocationId: target.id,
        quantity: 1, unit: '件', employeeId: employee.id, employeeCode: employee.code,
        operator: employee.name, status: 'REVERSED',
      },
    })

    const draftInput = flowTransferInputSchema.parse({
      transferDate: '2026-08-03', materialId: material.id,
      sourceLocationId: source.id, targetLocationId: target.id,
      quantity: 25, employeeId: employee.id, note: ' 待检转合格 ',
    })
    const created = await createManagedFlowTransfer(draftInput)
    assert.equal(created.transferNo, 'FT-20260803-010', '流程转移编号必须从当日最大历史序号递增')
    assert.equal(created.note, '待检转合格')
    assert.equal(nextFlowTransferNumber(parseFlowTransferDate('2026-08-03'), 'FT-20260803-019'), 'FT-20260803-020')

    const edited = await updateManagedFlowTransfer(created.id, { ...draftInput, quantity: 30, note: '更新草稿' })
    assert.deepEqual([edited.updated.quantity, edited.updated.note], [30, '更新草稿'])
    await assert.rejects(
      () => createManagedFlowTransfer({ ...draftInput, quantity: 101 }),
      /库存不足/,
      '保存流程转移草稿时应拒绝超过来源库位可用量的数量',
    )
    assert.equal(flowTransferInputSchema.safeParse({ ...draftInput, targetLocationId: source.id }).success, false)

    const workspace = await loadManagedFlowTransferWorkspace({ keyword: '流程 转移', status: 'DRAFT' })
    assert.equal(workspace.transfers.some((item) => item.id === created.id), true, '多关键词和状态必须能查询流程转移')
    assert.equal(workspace.materials.some((item) => item.id === material.id), true)
    assert.equal(workspace.locations.some((item) => item.id === source.id), true)
    assert.equal(workspace.locations.some((item) => item.id === target.id), true)
    assert.equal(workspace.employees.some((item) => item.id === employee.id), true)

    const stockBefore = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    const layersBefore = await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } })
    const confirmed = await confirmManagedFlowTransfer(created.id, '确认员', fixedNow)
    assert.equal(confirmed.updated.status, 'CONFIRMED')
    assert.equal(confirmed.updated.confirmedAt?.toISOString(), fixedNow.toISOString())
    await assert.rejects(() => confirmManagedFlowTransfer(created.id, '重复确认'), /只有草稿转移可以确认/)
    await assert.rejects(() => updateManagedFlowTransfer(created.id, draftInput), /只有草稿转移可以修改/)

    const stockAfterTransfer = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    const layersAfterTransfer = await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } })
    assert.deepEqual(
      [stockAfterTransfer.qty, stockAfterTransfer.availableQty, stockAfterTransfer.valuationQty, stockAfterTransfer.totalCost],
      [stockBefore.qty, stockBefore.availableQty, stockBefore.valuationQty, stockBefore.totalCost],
      '转移不应改变总库存、计价数量和总成本',
    )
    assert.deepEqual(layersAfterTransfer, layersBefore, '转移不应改变成本层')

    const qtyAt = async (locationId: string) => Number((await prisma.stockLocationBalance.findFirst({
      where: { stockId: stockBefore.id, locationId },
    }))?.qty || 0)
    assert.equal(await qtyAt(source.id), 70)
    assert.equal(await qtyAt(target.id), 30)
    const logs = await prisma.stockLog.findMany({
      where: { refType: 'FLOW_TRANSFER', refId: created.id }, orderBy: { createdAt: 'asc' },
    })
    assert.deepEqual(logs.map((log) => [log.type, log.qty, log.beforeQty, log.afterQty, log.costAmount]), [
      ['FLOW_TRANSFER_OUT', -30, 100, 100, 0],
      ['FLOW_TRANSFER_IN', 30, 100, 100, 0],
    ])

    const targetBalance = await prisma.stockLocationBalance.findFirstOrThrow({
      where: { stockId: stockBefore.id, locationId: target.id },
    })
    await prisma.stockLocationBalance.update({ where: { id: targetBalance.id }, data: { qty: 29, availableQty: 29 } })
    await assert.rejects(
      () => reverseManagedFlowTransfer(created.id, { reason: '超量冲销验证' }, '验证员'),
      /库存不足/,
    )
    assert.equal((await prisma.flowTransfer.findUniqueOrThrow({ where: { id: created.id } })).status, 'CONFIRMED')
    await prisma.stockLocationBalance.update({ where: { id: targetBalance.id }, data: { qty: 30, availableQty: 30 } })

    const reversed = await reverseManagedFlowTransfer(
      created.id,
      { reason: '验证冲销' },
      '冲销员',
      fixedNow,
    )
    assert.equal(reversed.updated.status, 'REVERSED')
    assert.equal(await qtyAt(source.id), 100)
    assert.equal(await qtyAt(target.id), 0)
    await assert.rejects(
      () => reverseManagedFlowTransfer(created.id, { reason: '重复冲销' }, '冲销员'),
      /只有已确认转移可以冲销/,
    )
    const stockAfterReverse = await prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } })
    const layersAfterReverse = await prisma.inventoryCostLayer.findMany({ where: { materialId: material.id }, orderBy: { id: 'asc' } })
    assert.deepEqual(
      [stockAfterReverse.qty, stockAfterReverse.availableQty, stockAfterReverse.valuationQty, stockAfterReverse.totalCost],
      [stockBefore.qty, stockBefore.availableQty, stockBefore.valuationQty, stockBefore.totalCost],
    )
    assert.deepEqual(layersAfterReverse, layersBefore)
    const linkedTransferLogs = await prisma.stockLog.findMany({
      where: { refType: 'FLOW_TRANSFER', refId: created.id },
    })
    const byType = new Map(linkedTransferLogs.map((log) => [log.type, log]))
    assert.equal(byType.get('FLOW_TRANSFER_REVERSE_OUT')?.sourceMovementId, byType.get('FLOW_TRANSFER_IN')?.id)
    assert.equal(byType.get('FLOW_TRANSFER_IN')?.reversalMovementId, byType.get('FLOW_TRANSFER_REVERSE_OUT')?.id)
    assert.equal(byType.get('FLOW_TRANSFER_REVERSE_IN')?.sourceMovementId, byType.get('FLOW_TRANSFER_OUT')?.id)
    assert.equal(byType.get('FLOW_TRANSFER_OUT')?.reversalMovementId, byType.get('FLOW_TRANSFER_REVERSE_IN')?.id)
    assert.equal(flowTransferTransitionError('DRAFT', 'confirm'), null)
    assert.match(flowTransferTransitionError('REVERSED', 'confirm') ?? '', /只有草稿/)
    assert.match(flowTransferTransitionError('DRAFT', 'reverse') ?? '', /只有已确认/)
    console.log('流程转移垂直模块验证通过：编号、查询、草稿编辑、确认、冲销、重复状态拒绝及总库存/总成本不变符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
