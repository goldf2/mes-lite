import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-data-scopes-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, dataScope, dispatchQuery, stockQuery, flowQuery] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/identity-access'),
    import('../modules/production/server/dispatch-query-service'),
    import('../modules/inventory/server/stock-query-service'),
    import('../modules/production/server/flow-transfer-query-service'),
  ])
  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [wcA, wcB] = await Promise.all([
      prisma.workCenter.create({ data: { code: `WC-A-${suffix}`, name: '一车间' } }),
      prisma.workCenter.create({ data: { code: `WC-B-${suffix}`, name: '二车间' } }),
    ])
    const [locA, locB] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `LOC-A-${suffix}`, name: '一号库', isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `LOC-B-${suffix}`, name: '二号库' } }),
    ])
    const [employeeA, employeeB] = await Promise.all([
      prisma.employee.create({ data: { code: `E-A-${suffix}`, name: '员工甲' } }),
      prisma.employee.create({ data: { code: `E-B-${suffix}`, name: '员工乙' } }),
    ])
    const [operatorSelf, operatorCenter, operatorLegacy] = await Promise.all([
      prisma.operator.create({ data: { username: `self-${suffix}`, passwordHash: 'x', name: '本人账号', status: 'ACTIVE', employee: { connect: { id: employeeA.id } } } }),
      prisma.operator.create({ data: { username: `center-${suffix}`, passwordHash: 'x', name: '车间账号', status: 'ACTIVE' } }),
      prisma.operator.create({ data: { username: `legacy-${suffix}`, passwordHash: 'x', name: '旧账号', status: 'ACTIVE' } }),
    ])
    await prisma.operatorDataScope.create({ data: {
      operatorId: operatorSelf.id, productionMode: 'SELF', inventoryMode: 'LOCATIONS',
      locations: { create: { locationId: locA.id } },
    } })
    await prisma.operatorDataScope.create({ data: {
      operatorId: operatorCenter.id, productionMode: 'WORK_CENTERS', inventoryMode: 'LOCATIONS',
      workCenters: { create: { workCenterId: wcB.id } }, locations: { create: { locationId: locB.id } },
    } })

    const material = await prisma.material.create({ data: {
      code: `MAT-${suffix}`, name: '范围验证物料', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件',
    } })
    const product = await prisma.product.create({ data: {
      sku: `MAT-${suffix}`, name: material.name, category: 'FINISHED', unit: '件', materialId: material.id,
    } })
    const route = await prisma.processRoute.create({ data: {
      productId: product.id, materialId: material.id, name: '范围路线', isDefault: true,
      steps: { create: [
        { stepNo: 10, name: '一车间工序', workstation: wcA.name, workCenterId: wcA.id },
        { stepNo: 20, name: '二车间工序', workstation: wcB.name, workCenterId: wcB.id },
      ] },
    }, include: { steps: true } })
    const order = await prisma.productionOrder.create({ data: {
      orderNo: `PO-${suffix}`, productId: product.id, materialId: material.id, planQty: 100, status: 'RELEASED',
    } })
    const [dispatchA, dispatchB] = await Promise.all([
      prisma.dispatch.create({ data: { dispatchNo: `DP-A-${suffix}`, orderId: order.id, stepId: route.steps[0].id, employeeId: employeeA.id, workerName: employeeA.name, workerId: employeeA.code, planQty: 10 } }),
      prisma.dispatch.create({ data: { dispatchNo: `DP-B-${suffix}`, orderId: order.id, stepId: route.steps[1].id, employeeId: employeeB.id, workerName: employeeB.name, workerId: employeeB.code, planQty: 10 } }),
    ])
    await prisma.workReport.createMany({ data: [
      { orderId: order.id, stepId: route.steps[0].id, workerName: employeeA.name, workerId: employeeA.code, startTime: new Date(), endTime: new Date(), goodQty: 7, badQty: 1 },
      { orderId: order.id, stepId: route.steps[1].id, workerName: employeeB.name, workerId: employeeB.code, startTime: new Date(), endTime: new Date(), goodQty: 11, badQty: 2 },
    ] })
    const stock = await prisma.stock.create({ data: {
      materialId: material.id, qty: 30, availableQty: 30, valuationQty: 30, availableValuationQty: 30, totalCost: 300,
      locationBalances: { create: [
        { locationId: locA.id, qty: 10, availableQty: 10 },
        { locationId: locB.id, qty: 20, availableQty: 20 },
      ] },
    } })
    await prisma.flowTransfer.createMany({ data: [
      { transferNo: `FT-A-${suffix}`, transferDate: new Date(), materialId: material.id, sourceLocationId: locA.id, targetLocationId: locA.id, quantity: 1, unit: '件', operator: employeeA.name },
      { transferNo: `FT-B-${suffix}`, transferDate: new Date(), materialId: material.id, sourceLocationId: locB.id, targetLocationId: locB.id, quantity: 1, unit: '件', operator: employeeB.name },
    ] })

    const selfScope = await dataScope.loadEffectiveDataScope(operatorSelf)
    const centerScope = await dataScope.loadEffectiveDataScope(operatorCenter)
    const legacyScope = await dataScope.loadEffectiveDataScope(operatorLegacy)
    assert.equal(selfScope.employeeId, employeeA.id)
    assert.equal(legacyScope.inheritedLegacyDefault, true)
    assert.equal(legacyScope.productionMode, 'ALL')
    assert.equal(legacyScope.inventoryMode, 'ALL')

    const query = { statuses: [], page: 1, pageSize: 20 }
    assert.deepEqual((await dispatchQuery.listManagedDispatches(query, selfScope)).items.map((item) => item.id), [dispatchA.id])
    assert.deepEqual((await dispatchQuery.listManagedDispatches(query, centerScope)).items.map((item) => item.id), [dispatchB.id])
    assert.equal((await dispatchQuery.listManagedDispatches(query, legacyScope)).items.length, 2)
    await assert.rejects(() => dispatchQuery.getManagedDispatch(dispatchB.id, selfScope), dataScope.DataScopeError)
    dataScope.assertInventoryLocationDataScope(selfScope, [locA.id])
    assert.throws(() => dataScope.assertInventoryLocationDataScope(selfScope, [locB.id]), dataScope.DataScopeError)
    assert.throws(() => dataScope.assertInventoryLocationDataScope(selfScope, [locA.id, locB.id]), dataScope.DataScopeError)

    const stockRows = await stockQuery.listStocks({ type: null, keyword: '', category: null, categories: [], customerId: null, locationId: null, includeInvalid: false }, selfScope)
    const scopedStock = stockRows.find((item) => item.id === stock.id)
    assert.equal(scopedStock?.qty, 10)
    assert.equal(scopedStock?.locationBalances.length, 1)
    assert.equal(scopedStock?.totalCost, 0)
    assert.equal(scopedStock?.dataScopeRestricted, true)

    const selfFlow = await flowQuery.loadManagedFlowTransferWorkspace({}, selfScope)
    assert.deepEqual(selfFlow.locations.map((item) => item.id), [locA.id])
    assert.equal(selfFlow.transfers.length, 1)
    assert.equal(selfFlow.materials[0]?.stock?.qty, 10)
    assert.throws(() => dataScope.assertProductionAssignmentDataScope(centerScope, { employeeId: employeeA.id, workCenterId: wcA.id }), dataScope.DataScopeError)
    dataScope.assertProductionAssignmentDataScope(centerScope, { employeeId: employeeB.id, workCenterId: wcB.id })

    const statistics = await import('../modules/production/server/production-statistics-query-service')
    assert.deepEqual(await statistics.getProductionStatistics({ groupBy: 'worker' }, selfScope), [
      { workerName: employeeA.name, goodQty: 7, badQty: 1, reportCount: 1 },
    ])
    assert.deepEqual(await statistics.getProductionStatistics({ groupBy: 'worker' }, centerScope), [
      { workerName: employeeB.name, goodQty: 11, badQty: 2, reportCount: 1 },
    ])
    const selfQuality = await statistics.getQualityStatistics({}, selfScope)
    assert.deepEqual([selfQuality.totalGood, selfQuality.totalBad, selfQuality.byOrder.length], [7, 1, 1])

    console.log('数据范围验证通过：旧账号保持全厂；本人、工作中心和库位的列表/详情/候选/命令/统计均按服务端范围收窄。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
