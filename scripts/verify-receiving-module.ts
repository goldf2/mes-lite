import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EffectiveDataScope } from '../modules/identity-access'
import type { MaterialInSavePayload } from '../modules/receiving/contracts/material-in'

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
  const validItem = { materialId: 'material', locationId: 'location', qty: 2, unitPrice: 3, priceUnit: '件' as const }
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
    'modules/receiving/server/material-in-conversion-history-service.ts',
  ]
  for (const file of requiredFiles) assert.ok(existsSync(join(root, file)), `来料领域缺少文件：${file}`)

  const routes = [
    'app/api/material-ins/route.ts',
    'app/api/material-ins/[id]/route.ts',
    'app/api/material-ins/[id]/receive/route.ts',
    'app/api/material-ins/[id]/reject/route.ts',
    'app/api/material-ins/[id]/reverse/route.ts',
    'app/api/material-ins/conversion-history/route.ts',
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
  const collection = read('modules/receiving/ui/MaterialInCollectionView.tsx')
  const renderer = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  const editor = read('modules/receiving/ui/MaterialInEditorDialog.tsx')
  const select = read('app/components/SearchableSelect.tsx')
  assert.doesNotMatch(service + statusService, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '来料领域服务不得依赖 HTTP、权限或请求审计')
  assert.match(service, /tokenizeKeywordQuery/, '来料查询必须保留空格分隔的多关键词搜索')
  assert.match(service, /\$transaction[\s\S]*createMaterialInLine/, '多物料来料单必须在同一事务创建')
  assert.match(statusService, /postInventoryReceipt/, '确认收货必须复用公共库存过账服务')
  assert.doesNotMatch(page, /fetch\(/, '来料页面不得直接发起 HTTP 请求')
  assert.match(page, /MaterialInCollectionView/, '来料页面必须委托集合视图')
  assert.match(page, /MaterialInEditorDialog/, '来料页面必须委托编辑任务')
  assert.match(page, /getMaterialInConversionHistory/, '来料页面必须读取公共历史换算服务')
  assert.match(page, /canCreate[\s\S]*canUpdate[\s\S]*canReceive[\s\S]*canReverse/, '来料页面必须接收编辑、收货和红冲的独立权限')
  assert.match(collection, /canReceive[\s\S]*整单收货[\s\S]*整单拒收/, '来料集合视图必须按收货命令权限显示收货与拒收')
  assert.match(collection, /canReverse[\s\S]*整单红冲/, '来料集合视图必须按红冲命令权限显示红冲')
  assert.match(renderer, /canReceive=\{context\.canUpdate\('materialInReceive'\)\}/, '来料页面必须从应用壳获得独立收货权限')
  assert.match(renderer, /canReverse=\{context\.canUpdate\('materialInReverse'\)\}/, '来料页面必须从应用壳获得独立红冲权限')
  assert.match(editor, /SearchableSelect[\s\S]*onSearch=/, '来料编辑必须复用支持异步联想的公共搜索选择器')
  assert.match(editor, /历史实测加权推算/, '来料编辑必须明确展示历史推算来源')
  assert.match(editor, /bodyClassName="xl:flex xl:overflow-hidden"[\s\S]*xl:flex-1/, '宽屏来料双栏必须从弹窗正文获得受约束的可用高度')
  assert.match(editor, /aria-label="本单已加入清单"[\s\S]*mes-receipt-draft-scroll[\s\S]*xl:overflow-y-scroll/, '宽屏来料右侧清单必须在固定标题下使用独立可见滚动区')
  assert.match(editor, /onEditDraftItem\(item\)[\s\S]*编辑[\s\S]*移除/, '来料右侧已加入明细必须同时提供编辑和移除操作')
  assert.match(page, /setDraftItems\(\(current\) => editingDraftItemId[\s\S]*current\.map/, '编辑已加入明细必须按原草稿 ID 替换，不能追加重复项')
  assert.match(page, /editingDraftItemId[\s\S]*priceInputMode: 'TOTAL'/, '编辑已加入明细必须回填原总价并保持计价快照')
  assert.match(editor, /cancelLabel=\{editingItem \? '关闭' : '取消'\}[\s\S]*保存整单/, '已有来料单必须把保存整单与关闭弹窗拆成独立动作')
  assert.match(page, /if \(editingItem\) \{[\s\S]*setEditingItem\(data\.data\)[\s\S]*setDraftItems[\s\S]*resetCurrentItem\(\)[\s\S]*await fetchMaterialIns\(\)[\s\S]*\} else \{[\s\S]*setShowModal\(false\)/, '已有来料单保存后必须停留在编辑弹窗并刷新草稿，新建成功才关闭')
  assert.doesNotMatch(editor, /开启比例联动|实测快照|单件长度/, '普通来料界面不得继续依赖旧批次三字段联动')
  assert.match(select, /onSearch\?:[\s\S]*window\.setTimeout/, '公共搜索选择器必须提供防抖异步联想契约')
  assert.match(select, /aria-label=\{open \? '收起选项' : '展开选项'\}[\s\S]*onClick=\{togglePopup\}/, '公共搜索选择器的下拉箭头必须是可操作按钮，不能依赖输入框重复聚焦')
  assert.doesNotMatch(select, /pointer-events-none[\s\S]*>⌄<\/span>/, '公共搜索选择器不得继续使用不可操作的文字箭头')
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
    { loadMaterialInConversionHistory },
    { saveMaterialInRecord },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/receiving/contracts/material-in-schema'),
    import('../modules/receiving/domain/material-in-errors'),
    import('../modules/receiving/domain/material-in-numbering'),
    import('../modules/receiving/domain/material-in-reversal'),
    import('../modules/receiving/server/material-in-service'),
    import('../modules/receiving/server/material-in-detail-service'),
    import('../modules/receiving/server/material-in-status-service'),
    import('../modules/receiving/server/material-in-conversion-history-service'),
    import('../modules/receiving/client/material-in-api'),
  ])
  try {
    verifyStaticBoundaries(createMaterialInSchema)
    const savePayload: MaterialInSavePayload = {
      supplierId: 'supplier',
      voucherNo: 'V-001',
      stagingLocationId: 'location',
      receivedBy: '验证员',
      note: '网络恢复验证',
      items: [{
        materialId: 'material', locationId: 'location', qty: 2, unit: '件', valuationUnit: '件',
        unitPrice: 3, totalAmount: 6, priceUnit: '件', priceBasis: 'STOCK',
      }],
    }
    const recoveredRecord = {
      id: 'receipt', inboundNo: 'IN-VERIFY-001', supplierId: 'supplier', stagingLocationId: 'location',
      voucherNo: 'V-001', receivedBy: '验证员', note: '网络恢复验证',
      items: [{
        materialId: 'material', locationId: 'location', lineNo: 1, qty: 2, unit: '件', valuationQty: 2,
        valuationUnit: '件', conversionSource: 'SAME_UNIT', unitPrice: 3, totalAmount: 6,
        priceUnit: '件', priceBasis: 'STOCK', batchNo: null,
      }],
    }
    const originalFetch = globalThis.fetch
    try {
      let requestCount = 0
      globalThis.fetch = async () => {
        requestCount += 1
        if (requestCount === 1) throw new TypeError('Failed to fetch')
        return new Response(JSON.stringify({ data: recoveredRecord }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const recoveredSave = await saveMaterialInRecord('receipt', savePayload)
      assert.equal(recoveredSave.recovered, true, '编辑保存响应丢失后必须只读回查并确认服务器已保存')
      assert.equal(requestCount, 2, '保存恢复只能追加一次只读详情回查，不能自动重发写请求')

      requestCount = 0
      globalThis.fetch = async () => {
        requestCount += 1
        if (requestCount === 1) throw new TypeError('Failed to fetch')
        return new Response(JSON.stringify({
          data: { ...recoveredRecord, items: [{ ...recoveredRecord.items[0], qty: 1, totalAmount: 3 }] },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      await assert.rejects(
        () => saveMaterialInRecord('receipt', savePayload),
        (error: unknown) => error instanceof Error
          && /网络连接中断/.test(error.message)
          && !/Failed to fetch/.test(error.message),
        '服务器内容不一致时必须保留当前草稿并显示中文可操作提示',
      )
      assert.equal(requestCount, 2, '内容不一致时也不得自动重发写请求')

      requestCount = 0
      globalThis.fetch = async () => {
        requestCount += 1
        throw new TypeError('Failed to fetch')
      }
      await assert.rejects(
        () => saveMaterialInRecord(null, savePayload),
        (error: unknown) => error instanceof Error
          && /无法确认来料单是否创建/.test(error.message)
          && !/Failed to fetch/.test(error.message),
        '新建响应丢失时必须提示先核对列表，不能暴露浏览器原始英文异常',
      )
      assert.equal(requestCount, 1, '新建响应丢失时不得自动重发创建请求')
    } finally {
      globalThis.fetch = originalFetch
    }
    const fixedNow = new Date('2026-08-10T08:00:00.000Z')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [supplier, location, otherLocation, material, secondMaterial] = await Promise.all([
      prisma.supplier.create({ data: { code: `VERIFY-SUP-${suffix}`, name: `验证供应商 ${suffix}` } }),
      prisma.inventoryLocation.create({ data: { code: `VERIFY-IN-${suffix}`, name: `验证收货位 ${suffix}`, isDefault: true } }),
      prisma.inventoryLocation.create({ data: { code: `VERIFY-IN-X-${suffix}`, name: `验证其他收货位 ${suffix}` } }),
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
          materialId: material.id, locationId: location.id, qty: 5, valuationQty: 12,
          unitPrice: 4, priceUnit: 'kg', priceBasis: 'VALUATION', batchNo: 'BATCH-001',
        },
        {
          materialId: secondMaterial.id, locationId: location.id, qty: 3,
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
          materialId: material.id, qty: 6, valuationQty: 15,
          unitPrice: 4, priceUnit: 'kg', priceBasis: 'VALUATION',
          batchNo: 'BATCH-EDIT',
        },
        {
          materialId: secondMaterial.id, qty: 3,
          unitPrice: 8, priceUnit: '件', priceBasis: 'STOCK',
        },
      ],
    })
    const edited = await updateManagedMaterialIn(created.first.id, updateInput)
    assert.deepEqual(
      [edited.updated.items[0].qty, edited.updated.items[0].valuationQty, edited.updated.items[0].totalAmount, edited.updated.items[0].batchNo],
      [6, 15, 60, 'BATCH-EDIT'],
    )

    await receiveManagedMaterialIn(created.first.id, '验证收货员')
    const [received, receivedStock, receivedBalance, receivedLayer, receivedLog] = await Promise.all([
      getMaterialInDetail(created.first.id),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.stockLocationBalance.findFirstOrThrow({ where: { locationId: location.id, stock: { materialId: material.id } } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: edited.updated.items[0].id } }),
      prisma.stockLog.findFirstOrThrow({ where: { refType: 'MATERIAL_IN', refId: edited.updated.items[0].id } }),
    ])
    assert.equal(received.status, 'RECEIVED')
    assert.deepEqual([receivedStock.qty, receivedStock.valuationQty, receivedStock.totalCost], [6, 15, 60])
    assert.equal(receivedBalance.qty, 6)
    assert.equal(receivedLayer.remainingAmount, 60)
    assert.deepEqual([received.receivedBy, receivedLog.createdBy], ['验证收货员', '验证收货员'], '来料记录和库存流水必须使用服务端可信操作人')
    assert.equal(received.items.every((line) => line.status === 'RECEIVED'), true)
    await assert.rejects(() => receiveManagedMaterialIn(created.first.id, '验证收货员'), MaterialInDomainError, '来料不得重复收货')
    await assert.rejects(() => updateManagedMaterialIn(created.first.id, updateInput), /只有待收货来料单可以修改/)

    await reverseManagedMaterialIn(created.first.id, { reason: '验证整单红冲' }, '验证冲销员')
    const [reversed, reversedStock, reversedBalance, reversedLayer, reverseLog, linkedReceivedLog] = await Promise.all([
      getMaterialInDetail(created.first.id),
      prisma.stock.findUniqueOrThrow({ where: { materialId: material.id } }),
      prisma.stockLocationBalance.findFirstOrThrow({ where: { locationId: location.id, stock: { materialId: material.id } } }),
      prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: edited.updated.items[0].id } }),
      prisma.stockLog.findFirstOrThrow({ where: { refType: 'MATERIAL_IN_REVERSE', refId: edited.updated.items[0].id } }),
      prisma.stockLog.findUniqueOrThrow({ where: { id: receivedLog.id } }),
    ])
    assert.equal(reversed.status, 'REVERSED')
    assert.deepEqual([reversedStock.qty, reversedStock.valuationQty, reversedStock.totalCost], [0, 0, 0])
    assert.equal(reversedBalance.qty, 0)
    assert.equal(reversedLayer.status, 'REVERSED')
    assert.equal(reverseLog.costAmount, -60)
    assert.deepEqual([reverseLog.sourceMovementId, linkedReceivedLog.reversalMovementId], [receivedLog.id, reverseLog.id], '来料红冲必须建立可信双向流水关系')
    assert.equal(reverseLog.createdBy, '验证冲销员', '来料红冲流水必须使用服务端可信操作人')
    await assert.rejects(() => reverseManagedMaterialIn(created.first.id, { reason: '重复红冲' }, '验证冲销员'), /只有已收货来料单可以红冲/)

    const third = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id,
      materialId: secondMaterial.id, locationId: location.id, qty: 2,
      unitPrice: 5, priceUnit: '件', priceBasis: 'STOCK',
    }), fixedNow)
    assert.equal(third.first.inboundNo, 'IN-20260810-002', '多明细来料单只占用一个单据编号')
    await rejectManagedMaterialIn(third.first.id)
    assert.equal((await getMaterialInDetail(third.first.id)).status, 'REJECTED')
    await assert.rejects(() => receiveManagedMaterialIn(third.first.id, '验证收货员'), /无法确认收货/)

    const blocked = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id,
      materialId: secondMaterial.id, locationId: location.id, qty: 4,
      unitPrice: 5, priceUnit: '件', priceBasis: 'STOCK',
    }), fixedNow)
    await receiveManagedMaterialIn(blocked.first.id, '验证收货员')
    const blockedLine = blocked.items[0]
    const blockedLayer = await prisma.inventoryCostLayer.findFirstOrThrow({ where: { materialInId: blockedLine.id } })
    await prisma.inventoryCostLayer.update({ where: { id: blockedLayer.id }, data: { remainingStockQty: 3 } })
    await assert.rejects(
      () => reverseManagedMaterialIn(blocked.first.id, { reason: '已消耗批次验证' }, '验证冲销员'),
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
        qty: 1, unitPrice: 1, priceUnit: '件', priceBasis: 'STOCK',
      }), fixedNow),
      MaterialInDomainError,
    )

    const historyMaterial = await prisma.material.create({
      data: {
        code: `VERIFY-HISTORY-${suffix}`, name: `历史换算物料 ${suffix}`, unit: 'm', stockUnit: 'm', valuationUnit: 'kg',
        primaryMeasure: 'LENGTH', referenceMeasure: 'WEIGHT', conversionRate: 2,
      },
    })
    await assert.rejects(
      () => createMaterialIns(createMaterialInSchema.parse({
        supplierId: supplier.id, materialId: historyMaterial.id, locationId: location.id,
        qty: 10, unitPrice: 0, priceUnit: 'm', priceBasis: 'STOCK',
      }), fixedNow),
      /有效历史实测不足 3 批/,
      '无本批实测且历史不足时必须拒绝保存',
    )
    for (const [qty, valuationQty] of [[10, 20], [5, 11], [15, 27]] as const) {
      const actualReceipt = await createMaterialIns(createMaterialInSchema.parse({
        supplierId: supplier.id, materialId: historyMaterial.id, locationId: location.id,
        qty, valuationQty, unitPrice: 0, priceUnit: 'm', priceBasis: 'STOCK',
      }), fixedNow)
      await receiveManagedMaterialIn(actualReceipt.first.id, '验证收货员')
    }
    const history = await loadMaterialInConversionHistory(historyMaterial.id)
    assert.deepEqual(
      [history.sampleCount, history.rate, history.available],
      [3, 1.933333, true],
      '历史换算必须按已收货实测批次进行加权计算',
    )
    const estimatedReceipt = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id, materialId: historyMaterial.id, locationId: location.id,
      qty: 12, unitPrice: 0, priceUnit: 'm', priceBasis: 'STOCK',
    }), fixedNow)
    assert.deepEqual(
      [estimatedReceipt.items[0].conversionSource, estimatedReceipt.items[0].conversionSampleCount, estimatedReceipt.items[0].valuationQty],
      ['HISTORICAL_ESTIMATE', 3, 23.199996],
      '辅助数量缺失时必须冻结历史推算来源、样本数和推算值',
    )
    await receiveManagedMaterialIn(estimatedReceipt.first.id, '验证收货员')
    assert.equal(
      (await loadMaterialInConversionHistory(historyMaterial.id)).sampleCount,
      3,
      '历史推算记录不得反向污染实测样本',
    )
    const externalReceipt = await createMaterialIns(createMaterialInSchema.parse({
      supplierId: supplier.id, materialId: historyMaterial.id, locationId: otherLocation.id,
      qty: 10, valuationQty: 100, unitPrice: 0, priceUnit: 'm', priceBasis: 'STOCK',
    }), fixedNow)
    await receiveManagedMaterialIn(externalReceipt.first.id, '其他库位收货员')
    const locationScope: EffectiveDataScope = {
      operatorId: 'receiving-scope', employeeId: null, employeeCode: null,
      productionMode: 'ALL', inventoryMode: 'LOCATIONS',
      workCenterIds: [], locationIds: [location.id], inheritedLegacyDefault: false,
    }
    const scopedHistory = await loadMaterialInConversionHistory(historyMaterial.id, locationScope)
    assert.deepEqual(
      [scopedHistory.sampleCount, scopedHistory.rate],
      [3, 1.933333],
      '历史换算只能聚合当前账号授权库位的实测样本',
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
