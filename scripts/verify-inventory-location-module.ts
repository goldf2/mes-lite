import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-inventory-location-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/configuration/contracts/inventory-location-schema.ts',
    'modules/configuration/domain/inventory-location-errors.ts',
    'modules/configuration/domain/inventory-location-rules.ts',
    'modules/configuration/server/inventory-location-query-service.ts',
    'modules/configuration/server/inventory-location-command-service.ts',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `配置领域缺少库位模块文件：${path}`)

  const route = read('app/api/inventory-locations/route.ts')
  assert.ok(route.split('\n').length <= 105, '库位 API 应保持为不超过 105 行的 HTTP 适配层')
  assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, '库位 API 不得直接访问 Prisma 或持有事务')
  assert.match(route, /@\/modules\/configuration\//, '库位 API 必须委托配置领域服务')

  const services = [
    read('modules/configuration/server/inventory-location-query-service.ts'),
    read('modules/configuration/server/inventory-location-command-service.ts'),
  ].join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '库位服务不得依赖 HTTP、权限或请求审计')
  const command = read('modules/configuration/server/inventory-location-command-service.ts')
  for (const relation of ['materialIn', 'dailyProductionReport', 'flowTransfer', 'shipment', 'returnOrder']) {
    assert.match(command, new RegExp(`tx\\.${relation}\\.count`), `库位归档必须检查 ${relation} 待处理引用`)
  }
}

async function main() {
  const [
    { prisma },
    { inventoryLocationFieldsSchema },
    { InventoryLocationDomainError },
    { normalizeInventoryLocationCode, resolveNewInventoryLocationState },
    { listManagedInventoryLocations },
    { createManagedInventoryLocation, updateManagedInventoryLocation, archiveManagedInventoryLocation },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/configuration/contracts/inventory-location-schema'),
    import('../modules/configuration/domain/inventory-location-errors'),
    import('../modules/configuration/domain/inventory-location-rules'),
    import('../modules/configuration/server/inventory-location-query-service'),
    import('../modules/configuration/server/inventory-location-command-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.equal(inventoryLocationFieldsSchema.safeParse({ code: '  ', name: '空编码' }).success, false)
    assert.equal(normalizeInventoryLocationCode(' raw 01 '), 'RAW01')
    assert.throws(
      () => resolveNewInventoryLocationState({ code: 'A', name: 'A', isDefault: true, isActive: false }, true),
      /默认库位必须保持启用/,
    )
    await prisma.inventoryLocation.deleteMany()

    const first = await createManagedInventoryLocation({
      code: ' default ', name: ' 首个库位 ', note: ' 自动默认 ', isActive: false,
    })
    assert.deepEqual(
      [first.code, first.name, first.note, first.isDefault, first.isActive, first.sortOrder],
      ['DEFAULT', '首个库位', '自动默认', true, true, 0],
      '没有有效默认库位时，首个库位必须自动成为启用默认库位',
    )
    const second = await createManagedInventoryLocation({ code: ' zone b ', name: '待检区' })
    assert.deepEqual([second.code, second.isDefault, second.isActive, second.sortOrder], ['ZONEB', false, true, 1])
    await assert.rejects(
      () => createManagedInventoryLocation({ code: 'zone b', name: '重复编码' }),
      (error: unknown) => error instanceof InventoryLocationDomainError && error.status === 409,
    )
    await assert.rejects(
      () => updateManagedInventoryLocation({ id: first.id, isDefault: false }),
      /请先将其他库位设为默认库位/,
    )
    await assert.rejects(
      () => updateManagedInventoryLocation({ id: second.id, isActive: false }),
      /请使用归档操作停用库位/,
      'PATCH 不得绕开归档前的库存和业务引用检查',
    )

    const material = await prisma.material.create({
      data: { code: 'LOC-VERIFY-MAT', name: '库位验证物料', unit: '件', stockUnit: '件' },
    })
    const stock = await prisma.stock.create({ data: { materialId: material.id, qty: 2, availableQty: 2 } })
    const balance = await prisma.stockLocationBalance.create({
      data: { stockId: stock.id, locationId: second.id, qty: 2, availableQty: 2 },
    })
    const listed = await listManagedInventoryLocations(true)
    const listedSecond = listed.find((item) => item.id === second.id)
    assert.deepEqual(
      [listedSecond?.materialCount, listedSecond?.qty, listedSecond?.reservedQty, listedSecond?.availableQty],
      [1, 2, 0, 2],
      '库位查询必须集中装配物料数和数量汇总',
    )
    await assert.rejects(() => archiveManagedInventoryLocation(second.id), /仍有库存或占用数量/)

    await prisma.stockLocationBalance.update({
      where: { id: balance.id }, data: { qty: 0, availableQty: 0 },
    })
    const supplier = await prisma.supplier.create({ data: { code: 'LOC-VERIFY-SUP', name: '验证供应商' } })
    const receipt = await prisma.materialIn.create({
      data: {
        inboundNo: 'LOC-VERIFY-IN', supplierId: supplier.id, materialId: material.id,
        locationId: second.id, qty: 1, unit: '件', status: 'PENDING',
      },
    })
    await assert.rejects(() => archiveManagedInventoryLocation(second.id), /仍被待处理的来料、生产、转移、发货或退货单引用/)
    await prisma.materialIn.update({ where: { id: receipt.id }, data: { status: 'REJECTED' } })

    const archivedAt = new Date('2026-08-10T09:00:00.000Z')
    const archived = await archiveManagedInventoryLocation(second.id, archivedAt)
    assert.deepEqual([archived.saved.isActive, archived.saved.deletedAt?.toISOString()], [false, archivedAt.toISOString()])
    assert.equal((await listManagedInventoryLocations(false)).some((item) => item.id === second.id), false)

    const restoredDefault = await updateManagedInventoryLocation({ id: second.id, isDefault: true, isActive: true })
    assert.deepEqual([restoredDefault.saved.isDefault, restoredDefault.saved.isActive, restoredDefault.saved.deletedAt], [true, true, null])
    assert.equal((await prisma.inventoryLocation.findUniqueOrThrow({ where: { id: first.id } })).isDefault, false)
    await assert.rejects(() => archiveManagedInventoryLocation(second.id), /默认库位不能归档/)

    console.log('库位模块验证通过：默认库位、编码、汇总、库存/待处理引用归档阻断、恢复和 PATCH 旁路封闭符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
