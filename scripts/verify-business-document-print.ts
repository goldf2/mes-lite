import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-business-documents-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const uploadRoot = join(verifyRoot, 'uploads')

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl
process.env.MES_LITE_UPLOAD_DIR = uploadRoot

const consumingPages = [
  'modules/receiving/ui/MaterialInCollectionView.tsx',
  'modules/receiving/ui/MaterialInDetailDialog.tsx',
  'modules/sales/ui/ReturnPageModule.tsx',
  'modules/sales/ui/SalesOrderPageModule.tsx',
  'modules/sales/ui/ShipmentPageModule.tsx',
  'modules/production/ui/ProductionOrderModule.tsx',
  'modules/production/ui/FlowTransferPageModule.tsx',
  'modules/production/ui/DispatchPageModule.tsx',
] as const

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/business-documents/client/business-document-client.ts',
    'modules/business-documents/contracts/business-document.ts',
    'modules/business-documents/domain/business-document-definition.ts',
    'modules/business-documents/domain/business-document-errors.ts',
    'modules/business-documents/domain/business-document-format.ts',
    'modules/business-documents/http/business-document-http.ts',
    'modules/business-documents/server/business-document-pdf.ts',
    'modules/business-documents/server/business-document-print-query-service.ts',
    'modules/business-documents/server/business-document-print-service.ts',
    'modules/business-documents/ui/BusinessDocumentDetailDialog.tsx',
    'modules/business-documents/ui/BusinessDocumentPrintLink.tsx',
    'modules/business-documents/index.ts',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `业务单据模块缺少：${path}`)
  for (const path of [
    'app/components/BusinessDocumentDetailDialog.tsx',
    'app/components/BusinessDocumentPrintLink.tsx',
    'lib/business-document-pdf.ts',
  ]) assert.equal(existsSync(join(root, path)), false, `不得保留业务单据并行实现：${path}`)

  const route = read('app/api/business-documents/[kind]/[id]/print/route.ts')
  const definition = read('modules/business-documents/domain/business-document-definition.ts')
  const query = read('modules/business-documents/server/business-document-print-query-service.ts')
  const service = read('modules/business-documents/server/business-document-print-service.ts')
  const renderer = read('modules/business-documents/server/business-document-pdf.ts')
  const detailDialog = read('modules/business-documents/ui/BusinessDocumentDetailDialog.tsx')
  const moduleIndex = read('modules/business-documents/index.ts')

  assert.ok(route.split('\n').length <= 50, '业务单据打印 API 应保持为不超过 50 行的 HTTP 适配层')
  assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|node:fs|pdfkit|loadBusinessDocumentPrintData|renderBusinessDocumentPdf/, '打印 API 不得访问 Prisma、文件系统、PDF 引擎或单据投影规则')
  assert.match(route, /@\/modules\/business-documents\//, '打印 API 必须委托业务单据模块')
  assert.match(service, /resolveBusinessDocumentPdf[\s\S]*renderBusinessDocumentPdf/, '打印服务必须统一生成 PDF')
  assert.match(service, /latestArchivedPdf[\s\S]*documentAttachment[\s\S]*readFile[\s\S]*documentAttachment\.create/, '打印服务必须统一归档、缓存和重生成版本')
  assert.match(query, /salesOrder[\s\S]*materialReceipt[\s\S]*shipment[\s\S]*returnOrder[\s\S]*flowTransfer[\s\S]*productionOrder[\s\S]*dispatch/, '查询服务必须集中装配 7 类单据打印投影，来料按单头聚合多明细')
  assert.match(renderer, /new PDFDocument[\s\S]*bufferedPageRange/, '业务单据模块必须拥有统一多页 PDF 引擎')
  assert.match(detailDialog, /<ModalDialog[\s\S]*<AttachmentPanel/, '业务单据详情必须复用公共弹窗和附件骨架')
  assert.doesNotMatch(moduleIndex, /server\//, '供页面使用的公开出口不得把 Node 服务打入客户端边界')
  for (const kind of ['material-in', 'sales-order', 'shipment', 'return', 'flow-transfer', 'production-order', 'dispatch']) {
    assert.ok(definition.includes(kind), `业务单据定义必须覆盖 ${kind}`)
  }
  for (const path of consumingPages) {
    const source = read(path)
    assert.match(source, /from '@\/modules\/business-documents'/, `${path} 必须通过业务单据模块公开出口调用`)
    assert.doesNotMatch(source, /@\/app\/components\/BusinessDocument/, `${path} 不得绕回旧根组件`)
  }

  const creationSources = [
    read('modules/receiving/ui/MaterialInPage.tsx'),
    read('modules/receiving/ui/MaterialInEditorDialog.tsx'),
    read('modules/sales/ui/SalesOrderPageModule.tsx'),
    read('modules/sales/ui/ShipmentCreateDialog.tsx'),
    read('modules/sales/ui/ReturnPageModule.tsx'),
    read('modules/production/ui/FlowTransferPageModule.tsx'),
    read('modules/production/ui/DispatchPageModule.tsx'),
    read('modules/production/ui/ProductionOrderModule.tsx'),
  ].join('\n')
  assert.doesNotMatch(creationSources, /(?:保存|创建).*输出 PDF/, '保存业务单据与输出 PDF 必须是两个独立动作')
  assert.doesNotMatch(creationSources, /generateBusinessDocumentPdfArchives|reserveBusinessDocumentPrintWindow/, '保存流程不得生成或打开 PDF')
  assert.match(read('modules/business-documents/ui/BusinessDocumentPrintLink.tsx'), /打印/, '单据列表和详情必须保留独立打印入口')
}

async function main() {
  const [
    { prisma },
    { updateSystemSettings },
    { businessDocumentDefinition, GENERATED_BUSINESS_DOCUMENT_PDF_TYPE },
    { BusinessDocumentError },
    format,
    { renderBusinessDocumentPdf, businessDocumentPrintProfile },
    { loadBusinessDocumentPrintData },
    printService,
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/system-settings'),
    import('../modules/business-documents/domain/business-document-definition'),
    import('../modules/business-documents/domain/business-document-errors'),
    import('../modules/business-documents/domain/business-document-format'),
    import('../modules/business-documents/server/business-document-pdf'),
    import('../modules/business-documents/server/business-document-print-query-service'),
    import('../modules/business-documents/server/business-document-print-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.deepEqual(businessDocumentDefinition('shipment'), { permissionResource: 'shipment', ownerType: 'SHIPMENT' })
    assert.equal(businessDocumentDefinition('unsupported'), null)
    assert.equal(format.businessDocumentNumberText(2.500), '2.5')
    assert.equal(format.businessDocumentMoney(20), '¥20.00')

    const standalonePdf = await renderBusinessDocumentPdf({
      title: '销售订单', documentNo: 'SO-VERIFY-001', status: '草稿', documentDate: '2026-08-08',
      partyLabel: '客户', partyName: '测试客户',
      columns: [
        { label: '序号', key: 'index', width: 1 },
        { label: '物料', key: 'material', width: 3 },
        { label: '数量', key: 'qty', width: 1, align: 'right' },
      ],
      rows: [{ index: '1', material: '测试物料', qty: '2 件' }],
    }, {
      naturalMaterialCodeSortEnabled: true, companyName: 'MES-lite 测试企业', companyContact: '',
      companyPhone: '', companyAddress: '', businessDocumentPrintDensity: 'compact',
      businessDocumentPrintMarginMm: 10, aiLoadingIndicatorEnabled: true, contrastMode: 'standard',
    })
    assert.equal(standalonePdf.subarray(0, 5).toString(), '%PDF-')
    assert.ok(standalonePdf.byteLength > 5_000, 'PDF 不应为空壳文件')
    assert.equal(businessDocumentPrintProfile({
      naturalMaterialCodeSortEnabled: true, companyName: '', companyContact: '', companyPhone: '', companyAddress: '',
      businessDocumentPrintDensity: 'compact', businessDocumentPrintMarginMm: 10,
      aiLoadingIndicatorEnabled: true, contrastMode: 'standard',
    }), 'business-document-print:v2:compact:10')

    const compactReceiptPdf = await renderBusinessDocumentPdf({
      title: '来料单', documentNo: 'MI-VERIFY-014', status: '待分库', documentDate: '2026-08-18',
      partyLabel: '供应商', partyName: '单页打印验证供应商',
      summaryFields: [
        { label: '凭据号', value: 'VOUCHER-014' },
        { label: '待分库库位', value: 'DEFAULT · 默认库位' },
        { label: '明细数量', value: '14 项' },
      ],
      columns: [
        { label: '序号', key: 'index', width: 0.6, align: 'center' },
        { label: '物料', key: 'material', width: 2.4 },
        { label: '规格', key: 'spec', width: 1.4 },
        { label: '数量', key: 'qty', width: 1, align: 'right' },
        { label: '单价', key: 'price', width: 1, align: 'right' },
        { label: '金额', key: 'amount', width: 1, align: 'right' },
      ],
      rows: Array.from({ length: 14 }, (_, index) => ({
        index: String(index + 1), material: `验证物料 ${index + 1}`, spec: `B${String(index + 1).padStart(3, '0')}`,
        qty: `${100 + index} kg`, price: '¥0.00', amount: '¥0.00',
      })),
      totalLabel: '合计', totalValue: '¥0.00', note: '紧凑版 A4 单页验证',
    }, {
      naturalMaterialCodeSortEnabled: true, companyName: 'MES-lite 测试企业', companyContact: '',
      companyPhone: '', companyAddress: '', businessDocumentPrintDensity: 'compact',
      businessDocumentPrintMarginMm: 10, aiLoadingIndicatorEnabled: true, contrastMode: 'standard',
    })
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const compactDocument = await getDocument({ data: new Uint8Array(compactReceiptPdf) }).promise
    assert.equal(compactDocument.numPages, 1, '紧凑版 A4 必须容纳 14 条来料明细、备注和签字栏')
    await compactDocument.destroy()

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [material, sourceLocation, targetLocation] = await Promise.all([
      prisma.material.create({ data: { code: `PRINT-MAT-${suffix}`, name: '打印验证物料', unit: '件', spec: 'A-01' } }),
      prisma.inventoryLocation.create({ data: { code: `PRINT-S-${suffix}`, name: '打印来源库位' } }),
      prisma.inventoryLocation.create({ data: { code: `PRINT-T-${suffix}`, name: '打印目标库位' } }),
    ])
    const transfer = await prisma.flowTransfer.create({
      data: {
        transferNo: `PRINT-FT-${suffix}`, transferDate: new Date('2026-08-10T08:00:00.000Z'),
        materialId: material.id, sourceLocationId: sourceLocation.id, targetLocationId: targetLocation.id,
        quantity: 2.5, unit: '件', operator: '验证员工', status: 'CONFIRMED',
      },
    })
    const projection = await loadBusinessDocumentPrintData('flow-transfer', transfer.id)
    assert.deepEqual(
      [projection?.title, projection?.documentNo, projection?.status, projection?.rows[0].qty],
      ['流程转移单', transfer.transferNo, '已确认', '2.5 件'],
      '打印查询必须把业务记录转换为稳定的打印投影',
    )

    assert.equal(await printService.hasArchivedBusinessDocumentPdf('flow-transfer', transfer.id), false)
    const generated = await printService.resolveBusinessDocumentPdf('flow-transfer', transfer.id)
    assert.equal(generated.pdf.subarray(0, 5).toString(), '%PDF-')
    assert.equal(await printService.hasArchivedBusinessDocumentPdf('flow-transfer', transfer.id), true)
    const firstAttachments = await prisma.documentAttachment.findMany({ where: { ownerType: 'FLOW_TRANSFER', ownerId: transfer.id } })
    assert.equal(firstAttachments.length, 1)
    assert.equal(firstAttachments[0].documentType, GENERATED_BUSINESS_DOCUMENT_PDF_TYPE)
    assert.ok(existsSync(firstAttachments[0].storagePath), '归档 PDF 必须写入临时上传目录')

    const cached = await printService.resolveBusinessDocumentPdf('flow-transfer', transfer.id)
    assert.equal(cached.pdf.equals(generated.pdf), true, '普通补打必须复用已有归档 PDF')
    assert.equal(await prisma.documentAttachment.count({ where: { ownerType: 'FLOW_TRANSFER', ownerId: transfer.id } }), 1)

    await updateSystemSettings({ businessDocumentPrintMarginMm: 12 })
    await printService.resolveBusinessDocumentPdf('flow-transfer', transfer.id)
    const reformatted = await prisma.documentAttachment.findMany({
      where: { ownerType: 'FLOW_TRANSFER', ownerId: transfer.id }, orderBy: { createdAt: 'asc' },
    })
    assert.equal(reformatted.length, 2, '打印设置变化后，下次补打必须保留新格式归档')
    assert.match(reformatted[1].note || '', /business-document-print:v2:compact:12/)

    await printService.resolveBusinessDocumentPdf('flow-transfer', transfer.id, true)
    const regenerated = await prisma.documentAttachment.findMany({
      where: { ownerType: 'FLOW_TRANSFER', ownerId: transfer.id }, orderBy: { createdAt: 'asc' },
    })
    assert.equal(regenerated.length, 3, '强制重生成必须保留历史归档并新增版本')
    assert.match(regenerated[2].note || '', /按当前打印格式重新生成的归档版本；business-document-print:v2:compact:12/)
    await assert.rejects(
      () => printService.resolveBusinessDocumentPdf('flow-transfer', 'missing-document'),
      (error: unknown) => error instanceof BusinessDocumentError && error.status === 404,
    )

    console.log('业务单据打印验证通过：保存/打印分离、7 类投影、14 条紧凑 A4 单页、首次归档、缓存补打和重生成版本符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
