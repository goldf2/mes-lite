import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-receiving-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries(
  createMaterialInSchema: typeof import('../modules/receiving/contracts/material-in-schema').createMaterialInSchema,
) {
  const validItem = { materialId: 'material', locationId: 'location', qty: 2, unitPrice: 3, pieceCount: 2, priceUnit: '件' as const }
  assert.equal(createMaterialInSchema.safeParse({ supplierId: '', items: [] }).success, false, '来料单必须有供应商和至少一项物料')
  assert.equal(createMaterialInSchema.safeParse({ supplierId: 'supplier', items: [validItem] }).success, true, '多物料来料请求必须可解析')
  assert.equal(createMaterialInSchema.safeParse({ supplierId: 'supplier', items: Array.from({ length: 101 }, () => validItem) }).success, false, '单张来料单最多允许 100 项')

  const requiredFiles = [
    'modules/receiving/domain/material-in-errors.ts',
    'modules/receiving/domain/material-in-numbering.ts',
    'modules/receiving/domain/material-in-reversal.ts',
    'modules/receiving/server/material-in-service.ts',
    'modules/receiving/server/material-in-detail-service.ts',
    'modules/receiving/server/material-in-status-service.ts',
  ]
  for (const file of requiredFiles) assert.ok(existsSync(join(root, file)), `来料领域缺少文件：${file}`)

  const routes = [
    'app/api/material-ins/route.ts',
    'app/api/material-ins/[id]/route.ts',
    'app/api/material-ins/[id]/receive/route.ts',
    'app/api/material-ins/[id]/reject/route.ts',
    'app/api/material-ins/[id]/reverse/route.ts',
  ]
  for (const routePath of routes) {
    const route = read(routePath)
    assert.ok(route.split('\n').length <= 100, `来料 API 必须保持不超过 100 行：${routePath}`)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `来料 API 不得直接访问 Prisma：${routePath}`)
    assert.match(route, /@\/modules\/receiving\//, `来料 API 必须委托来料领域：${routePath}`)
  }

  const service = read('modules/receiving/server/material-in-service.ts')
  const statusService = read('modules/receiving/server/material-in-status-service.ts')
  const page = read('modules/receiving/ui/MaterialInPage.tsx')
  const editor = read('modules/receiving/ui/MaterialInEditorDialog.tsx')
  const select = read('app/components/SearchableSelect.tsx')
  assert.doesNotMatch(service + statusService, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '来料领域服务不得依赖 HTTP、权限或请求审计')
  assert.match(service, /tokenizeKeywordQuery/, '来料查询必须保留空格分隔的多关键词搜索')
  assert.match(service, /\$transaction[\s\S]*createMaterialInLine/, '多物料来料单必须在同一事务创建')
  assert.match(statusService, /postInventoryReceipt/, '确认收货必须复用公共库存过账服务')
  assert.doesNotMatch(page, /fetch\(/, '来料页面不得直接发起 HTTP 请求')
  assert.match(page, /MaterialInCollectionView/, '来料页面必须委托集合视图')
  assert.match(page, /MaterialInEditorDialog/, '来料页面必须委托编辑任务')
  assert.match(editor, /SearchableSelect[\s\S]*onSearch=/, '来料编辑必须复用支持异步联想的公共搜索选择器')
  assert.match(select, /onSearch\?:[\s\S]*window\.setTimeout/, '公共搜索选择器必须提供防抖异步联想契约')
  assert.ok(page.split('\n').length <= 800, '来料主页必须保持在 800 行以内')
}

async function main() {
  const [
    { prisma },
    { createMaterialInSchema, updateMaterialInSchema },
    { MaterialInDomainError },
    { nextMaterialInNumber },
    { calculateMaterialInReversal, isMaterialInCostLayerUntouched },
    { archiveMaterialIn, createMaterialIns, listMaterialIns },
    { getMaterialInDetail, updateManagedMaterialIn },
    { receiveManagedMaterialIn, rejectManagedMaterialIn, reverseManagedMaterialIn },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/receiving/contracts/material-in-schema'),
    import('../modules/receiving/domain/material-in-errors'),
    import('../modules/receiving/domain/material-in-numbering'),
    import('../modules/receiving/domain/material-in-reversal'),
    import('../modules/receiving/server/material-in-service'),
    import('../modules/receiving/server/material-in-detail-service'),
    import('../modules/receiving/server/material-in-status-service'),
  ])
  try {
    verifyStaticBoundaries(createMaterialInSchema)
    const fixedNow = new Date('2026-08-10T08:00:00.000Z')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [supplier, location, material, secondMaterial] = await Promise.all([
      prisma.supplier.create({ data: { code: `VERIFY-SUP-${suffix}`, name: `验证供应商 ${suffix}` } }),
      prisma.inventoryLocation.create({ data: { code: `VERIFY-IN-${suffix}`, name: `验证收货位 ${suffix}`, isDefault: true } }),
      prisma.material.create({
        data: {
          code: `VERIFY-RAW-${suffix}`, name: `验证铝材 ${suffix}`, unit: 'm', stockUnit: 'm', valuationUnit: 'kg',
          primaryMeasure: 'LENGTH', referenceMeasure: 'WEIGHT', conversionRate: 2,
        },
      }),
      prisma.material.create({
        data: {
          code: `VERIFY-AUX-${suffix}`, name: `验证辅料 ${suffix}`, unit: '件', stockUnit: '件', valuationUnit: '件',
          primaryMeasure: 'QUANTITY', referenceMeasure: 'QUANTITY', conversionRate: 1,
        },
      }),
    ])

    const created = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id,
      voucherNo: `V-${suffix}`,
      receivedBy: '验证收货员',
      items: [
        {
          materialId: material.id, locationId: location.id, qty: 5, pieceCount: 2,
          stockQtyMode: 'TOTAL', stockQtyInput: 5, totalLength: 5, totalWeight: 12,
          unitPrice: 4, priceUnit: 'kg', priceBasis: 'VALUATION', batchNo: 'BATCH-001',
        },
        {
          materialId: secondMaterial.id, locationId: location.id, qty: 3, pieceCount: 3,
          unitPrice: 8, priceUnit: '件', priceBasis: 'STOCK',
        },
      ],
    }), fixedNow)
    assert.equal(created.first.inboundNo, 'IN-20260810-001')
    assert.deepEqual(created.items.map((item) => item.inboundNo), ['IN-20260810-001-001', 'IN-20260810-001-002'])
    assert.equal(new Set(created.items.map((item) => item.receiptId)).size, 1, '多种物料必须属于同一来料单头')
    assert.equal(new Set(created.items.map((item) => item.locationId)).size, 1, '整单明细必须先进入同一待分库库位')
    assert.deepEqual(
      [created.items[0].qty, created.items[0].valuationQty, created.items[0].totalAmount],
      [5, 12, 48],
      '长度型来料必须按实测重量和计价单位生成数量、核算量与金额快照',
    )
    assert.equal(nextMaterialInNumber(fixedNow, 'IN-20260810-009'), 'IN-20260810-010')
    assert.equal((await getMaterialInDetail(created.first.id)).supplierId, supplier.id)

    const updateInput = updateMaterialInSchema.parse({
      supplierId: supplier.id, stagingLocationId: location.id,
      receivedBy: '编辑收货员', note: '编辑验证',
      items: [
        {
          materialId: material.id, qty: 6, pieceCount: 2, stockQtyMode: 'TOTAL', stockQtyInput: 6,
          totalLength: 6, totalWeight: 15, unitPrice: 4, priceUnit: 'kg', priceBasis: 'VALUATION',
          batchNo: 'BATCH-EDIT',
        },
        {
          materialId: secondMaterial.id, qty: 3, pieceCount: 3,
          unitPrice: 8, priceUnit: '件', priceBasis: 'STOCK',
        },
      ],
    })
    const edited = await updateManagedMaterialIn(created.first.id, updateInput)
    assert.deepEqual(
      [edited.updated.items[0].qty, edited.updated.items[0].valuationQty, edited.updated.items[0].totalAmount, edited.updated.items[0].batchNo],
      [6, 15, 60, 'BATCH-EDIT'],
    )

    await receiveManagedMaterialIn(created.first.id)
    const [received, receivedStock, receivedBalance, receivedLayer] = await Promise.all([
      getMaterialInDetail(created.first.id),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.stockLocationBalance.findFirstOrThrow({ where: { locationId: location.id, stock: { materialId: material.id } } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: edited.updated.items[0].id } }),
    ])
    assert.equal(received.status, 'RECEIVED')
    assert.deepEqual([receivedStock.qty, receivedStock.valuationQty, receivedStock.totalCost], [6, 15, 60])
    assert.equal(receivedBalance.qty, 6)
    assert.equal(receivedLayer.remainingAmount, 60)
    assert.equal(received.items.every((line) => line.status === 'RECEIVED'), true)
    await assert.rejects(() => receiveManagedMaterialIn(created.first.id), MaterialInDomainError, '来料不得重复收货')
    await assert.rejects(() => updateManagedMaterialIn(created.first.id, updateInput), /只有待收货来料单可以修改/)

    await reverseManagedMaterialIn(created.first.id, { reason: '验证整单红冲', reversedBy: '验证冲销员' })
    const [reversed, reversedStock, reversedBalance, reversedLayer, reverseLog] = await Promise.all([
      getMaterialInDetail(created.first.id),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.stockLocationBalance.findFirstOrThrow({ where: { locationId: location.id, stock: { materialId: material.id } } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: edited.updated.items[0].id } }),
      prisma.stockLog.findFirstOrThrow({ where: { refType: 'MATERIAL_IN_REVERSE', refId: edited.updated.items[0].id } }),
    ])
    assert.equal(reversed.status, 'REVERSED')
    assert.deepEqual([reversedStock.qty, reversedStock.valuationQty, reversedStock.totalCost], [0, 0, 0])
    assert.equal(reversedBalance.qty, 0)
    assert.equal(reversedLayer.status, 'REVERSED')
    assert.equal(reverseLog.costAmount, -60)
    await assert.rejects(() => reverseManagedMaterialIn(created.first.id, { reason: '重复红冲' }), /只有已收货来料单可以红冲/)

    const third = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id,
      materialId: secondMaterial.id, locationId: location.id, qty: 2, pieceCount: 2,
      unitPrice: 5, priceUnit: '件', priceBasis: 'STOCK',
    }), fixedNow)
    assert.equal(third.first.inboundNo, 'IN-20260810-002', '多明细来料单只占用一个单据编号')
    await rejectManagedMaterialIn(third.first.id)
    assert.equal((await getMaterialInDetail(third.first.id)).status, 'REJECTED')
    await assert.rejects(() => receiveManagedMaterialIn(third.first.id), /无法确认收货/)

    const blocked = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id,
      materialId: secondMaterial.id, locationId: location.id, qty: 4, pieceCount: 4,
      unitPrice: 5, priceUnit: '件', priceBasis: 'STOCK',
    }), fixedNow)
    await receiveManagedMaterialIn(blocked.first.id)
    const blockedLine = blocked.items[0]
    const blockedLayer = await prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: blockedLine.id } })
    await prisma.inventoryCostLayer.update({ where: { id: blockedLayer.id }, data: { remainingStockQty: 3 } })
    await assert.rejects(
      () => reverseManagedMaterialIn(blocked.first.id, { reason: '已消耗批次验证' }),
      /成本层已变动/,
      '已被使用的成本层必须阻止整单红冲',
    )

    const listed = await listMaterialIns({ statuses: [], keyword: '验证 辅料', page: 1, pageSize: 20 })
    assert.ok(listed.items.length >= 3, '多关键词必须同时命中关联物料字段')
    const archived = await archiveMaterialIn(third.first.id)
    assert.ok(archived.updated.deletedAt)
    const afterArchive = await listMaterialIns({ statuses: [], keyword: third.first.inboundNo, page: 1, pageSize: 20 })
    assert.equal(afterArchive.items.length, 0)
    await assert.rejects(
      () => createMaterialIns(createMaterialInSchema.parse({
        supplierId: 'missing-supplier', materialId: secondMaterial.id, locationId: location.id,
        qty: 1, pieceCount: 1, unitPrice: 1, priceUnit: '件', priceBasis: 'STOCK',
      }), fixedNow),
      MaterialInDomainError,
    )

    assert.equal(isMaterialInCostLayerUntouched({
      stockQty: 5, remainingStockQty: 5, valuationQty: 5, remainingValuationQty: 5,
      totalAmount: 50, remainingAmount: 50,
    }, 0), true)
    assert.throws(() => calculateMaterialInReversal({
      stockQty: 1, availableQty: 0, valuationQty: 1, availableValuationQty: 0,
      totalCost: 1, receiptQty: 1, receiptValuationQty: 1, receiptCost: 1, hasCostLayer: true,
    }), /可用库存不足/)

    console.log('来料垂直模块验证通过：多物料编号、编辑、收货、总量/库位/成本层过账、红冲、拒收、归档与重复状态拒绝符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
