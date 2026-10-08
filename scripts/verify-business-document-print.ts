import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
process.env.MES_PUBLIC_BASE_URL = 'https://mes.example.test'

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
    'modules/business-documents/server-index.ts',
    'modules/sales/server/shipment-document-service.ts',
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
  assert.match(renderer, /assets\/fonts\/NotoSansCJKsc-Regular\.otf/, '业务 PDF 必须有仓库内置中文字体回退')
  const detailDialog = read('modules/business-documents/ui/BusinessDocumentDetailDialog.tsx')
  const moduleIndex = read('modules/business-documents/index.ts')
  const shipmentPage = read('modules/sales/ui/ShipmentPageModule.tsx')

  assert.ok(route.split('\n').length <= 80, '业务单据打印 API 应保持为不超过 80 行的 HTTP 适配层')
  assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|node:fs|pdfkit|loadBusinessDocumentPrintData|renderBusinessDocumentPdf/, '打印 API 不得访问 Prisma、文件系统、PDF 引擎或单据投影规则')
  assert.match(route, /@\/modules\/business-documents\//, '打印 API 必须委托业务单据模块')
  assert.match(service, /resolveBusinessDocumentPdf[\s\S]*renderBusinessDocumentPdf/, '打印服务必须统一生成 PDF')
  assert.match(service, /latestArchivedPdf[\s\S]*documentAttachment[\s\S]*readFile[\s\S]*documentAttachment\.create/, '打印服务必须统一归档、缓存和重生成版本')
  assert.match(query, /salesOrder[\s\S]*materialReceipt[\s\S]*returnOrder[\s\S]*flowTransfer[\s\S]*productionOrder[\s\S]*dispatch/, '查询服务必须集中装配通用业务单据打印投影，来料按单头聚合多明细')
  assert.match(read('modules/sales/server/shipment-document-service.ts'), /SHIPMENT_CUSTOMER_PDF_TYPE[\s\S]*SHIPMENT_INTERNAL_PDF_TYPE[\s\S]*getShipmentDeliveryNoteSource/, '发货 PDF 必须由受众明确的统一服务生成')
  assert.doesNotMatch(read('modules/sales/server/shipment-delivery-note-service.ts'), /PDFDocument|QRCode|renderDeliveryNotePdf/, '销售兼容服务不得保留第二套发货 PDF 渲染器')
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
  assert.match(shipmentPage, /客户发货单/, '发货页面必须明确标注客户发货单输出')
  assert.match(shipmentPage, /内部留档/, '发货页面必须明确标注内部留档输出')
  assert.doesNotMatch(shipmentPage, /下载发货单 PDF|\/api\/shipments\/\$\{item\.id\}\/delivery-note/, '发货页面不得再同时暴露旧的第二套 PDF 输出')
}

async function main() {
  const [
    { prisma },
    { getSystemSettings, updateSystemSettings },
    { businessDocumentDefinition, GENERATED_BUSINESS_DOCUMENT_PDF_TYPE },
    { BusinessDocumentError },
    format,
    { renderBusinessDocumentPdf, businessDocumentPrintProfile },
    { loadBusinessDocumentPrintData },
    printService,
    shipmentPrintService,
    { SalesDomainError },
    { NextRequest },
    { middleware },
    { GET: publicDownload },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/system-settings'),
    import('../modules/business-documents/domain/business-document-definition'),
    import('../modules/business-documents/domain/business-document-errors'),
    import('../modules/business-documents/domain/business-document-format'),
    import('../modules/business-documents/server/business-document-pdf'),
    import('../modules/business-documents/server/business-document-print-query-service'),
    import('../modules/business-documents/server/business-document-print-service'),
    import('../modules/sales/server/shipment-document-service'),
    import('../modules/sales/domain/sales-errors'),
    import('next/server'),
    import('../middleware'),
    import('../app/api/public/shipment-documents/[id]/download/route'),
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
      businessDocumentPrintMarginMm: 10, aiLoadingIndicatorEnabled: true, contrastMode: 'standard', cadPreviewEngine: 'auto',
    })
    assert.equal(standalonePdf.subarray(0, 5).toString(), '%PDF-')
    assert.ok(standalonePdf.byteLength > 5_000, 'PDF 不应为空壳文件')
    assert.equal(businessDocumentPrintProfile({
      naturalMaterialCodeSortEnabled: true, companyName: '', companyContact: '', companyPhone: '', companyAddress: '',
      businessDocumentPrintDensity: 'compact', businessDocumentPrintMarginMm: 10,
      aiLoadingIndicatorEnabled: true, contrastMode: 'standard', cadPreviewEngine: 'auto',
    }), 'business-document-print:v3:compact:10:|||')

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
      businessDocumentPrintMarginMm: 10, aiLoadingIndicatorEnabled: true, contrastMode: 'standard', cadPreviewEngine: 'auto',
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

    await updateSystemSettings({ businessDocumentPrintMarginMm: 12, companyName: 'MES-lite 测试企业' })
    await printService.resolveBusinessDocumentPdf('flow-transfer', transfer.id)
    const reformatted = await prisma.documentAttachment.findMany({
      where: { ownerType: 'FLOW_TRANSFER', ownerId: transfer.id }, orderBy: { createdAt: 'asc' },
    })
    assert.equal(reformatted.length, 2, '打印设置变化后，下次补打必须保留新格式归档')
    assert.match(reformatted[1].note || '', /business-document-print:v3:compact:12/)

    await printService.resolveBusinessDocumentPdf('flow-transfer', transfer.id, true)
    const regenerated = await prisma.documentAttachment.findMany({
      where: { ownerType: 'FLOW_TRANSFER', ownerId: transfer.id }, orderBy: { createdAt: 'asc' },
    })
    assert.equal(regenerated.length, 3, '强制重生成必须保留历史归档并新增版本')
    assert.match(regenerated[2].note || '', /按当前打印格式重新生成的归档版本；business-document-print:v3:compact:12/)
    await assert.rejects(
      () => printService.resolveBusinessDocumentPdf('flow-transfer', 'missing-document'),
      (error: unknown) => error instanceof BusinessDocumentError && error.status === 404,
    )

    const shipmentMaterial = await prisma.material.create({ data: { code: `PRINT-SHIP-MAT-${suffix}`, name: '发货 PDF 验证物料', spec: 'S-01', unit: '件', stockUnit: '件' } })
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNo: `PRINT-SH-${suffix}`, customer: '发货 PDF 验证客户', customerPhone: '13800000000', address: '验证地址',
        status: 'SHIPPED', shippedAt: new Date('2026-08-18T09:00:00.000Z'), shippedBy: '验证发货人', trackingNo: 'TRACK-VERIFY',
        qty: 2, unitPrice: 0, totalAmount: 0, shippedCostAmount: 12,
      },
    })
    const shipmentItem = await prisma.shipmentItem.create({
      data: {
        shipmentId: shipment.id, materialId: shipmentMaterial.id, locationId: sourceLocation.id,
        qty: 2, unitSnapshot: '件', unitPrice: 0, totalAmount: 0, shippedCostAmount: 12,
      },
    })
    await prisma.packageDocument.create({
      data: {
        packageNo: `PKG-${suffix}`, shipmentId: shipment.id, packedBy: '验证包装人',
        items: { create: { shipmentItemId: shipmentItem.id, materialId: shipmentMaterial.id, quantity: 2, unitSnapshot: '件' } },
      },
    })
    const customerPreview = await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'customer' })
    const customerDownload = await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'customer' })
    assert.equal(customerPreview.pdf.equals(customerDownload.pdf), true, '客户预览与下载必须复用同一份归档字节')
    assert.equal(customerPreview.filename, `发货单-${shipment.shipmentNo}.pdf`)
    const internalArchive = await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'internal' })
    assert.equal(internalArchive.filename, `发货内部留档-${shipment.shipmentNo}.pdf`)
    assert.notEqual(internalArchive.pdf.equals(customerPreview.pdf), true, '客户版与内部留档应为明确不同的受众模板')
    if (process.env.PDF_VERIFY_OUTPUT_DIR) {
      mkdirSync(process.env.PDF_VERIFY_OUTPUT_DIR, { recursive: true })
      writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, 'customer-delivery.pdf'), customerPreview.pdf)
      writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, 'internal-archive.pdf'), internalArchive.pdf)
    }
    const shipmentAttachments = await prisma.documentAttachment.findMany({ where: { ownerType: 'SHIPMENT', ownerId: shipment.id }, orderBy: { createdAt: 'asc' } })
    assert.deepEqual(shipmentAttachments.map((attachment) => attachment.documentType), [
      shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE,
      shipmentPrintService.SHIPMENT_INTERNAL_PDF_TYPE,
    ], '客户版与内部版必须使用独立的生成文档类型')
    assert.equal(await shipmentPrintService.hasArchivedShipmentDocumentPdf(shipment.id, 'customer'), true)
    assert.equal(await shipmentPrintService.hasArchivedShipmentDocumentPdf(shipment.id, 'internal'), true)

    const customerAttachment = shipmentAttachments[0]
    const publicUrl = `https://mes.example.test${customerAttachment.url}`
    assert.match(customerAttachment.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, '公开下载必须使用每份归档独立的随机 UUID')
    assert.equal(customerAttachment.url, `/api/public/shipment-documents/${customerAttachment.id}/download`)
    assert.match(customerAttachment.note || '', /shipment-document:customer:v2:[\s\S]*download-origin=https:\/\/mes\.example\.test;/)
    assert.match(shipmentAttachments[1].note || '', /shipment-document:internal:v1:/, '内部版应继续复用原归档格式')
    assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(customerAttachment.id)).pdf.equals(customerPreview.pdf), true, '扫码必须读取纸单对应归档的原始字节')

    const downloadResponse = await publicDownload(new NextRequest(publicUrl), { params: { id: customerAttachment.id } })
    assert.equal(downloadResponse.status, 200)
    assert.equal(downloadResponse.headers.get('Content-Type'), 'application/pdf')
    assert.equal(downloadResponse.headers.get('Content-Disposition'), `attachment; filename*=UTF-8''${encodeURIComponent(customerPreview.filename)}`)
    assert.equal(downloadResponse.headers.get('Content-Length'), String(customerPreview.pdf.byteLength))
    assert.equal(downloadResponse.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(downloadResponse.headers.get('Referrer-Policy'), 'no-referrer')
    assert.equal(downloadResponse.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(Buffer.from(await downloadResponse.arrayBuffer()).equals(customerPreview.pdf), true, '匿名 HTTP 下载必须返回同一归档 PDF')

    for (const method of ['GET', 'HEAD']) {
      assert.equal(middleware(new NextRequest(publicUrl, { method })).headers.get('x-middleware-next'), '1', `${method} 扫码下载应允许无会话请求进入受限公开服务`)
    }
    for (const pathname of [
      '/api/shipments',
      `/api/business-documents/shipment/${shipment.id}/print?audience=internal`,
      `/api/attachments/${customerAttachment.id}/file`,
      '/api/public/shipment-documents/not-a-uuid/download',
      `/api/public/shipment-documents/${customerAttachment.id}/download/extra`,
      `/api/public/shipment-documents/${customerAttachment.id}/other`,
      '/api/public/other',
    ]) {
      assert.equal(middleware(new NextRequest(`https://mes.example.test${pathname}`)).status, 401, `匿名豁免不得扩展到 ${pathname}`)
    }
    assert.equal(middleware(new NextRequest(publicUrl, { method: 'POST' })).status, 403, '公开地址写请求仍需来源校验')
    assert.equal(middleware(new NextRequest(publicUrl, { method: 'POST', headers: { origin: 'https://mes.example.test' } })).status, 401, '合法来源写请求不能使用匿名下载豁免')
    assert.equal(middleware(new NextRequest('https://mes.example.test/uploads/private.pdf')).status, 404, '存储路径不能直接公开')

    const expectPublicUnavailable = async (id: string, status = 404, message?: RegExp) => {
      await assert.rejects(
        () => shipmentPrintService.resolvePublicShipmentDocumentPdf(id),
        (error: unknown) => error instanceof SalesDomainError && error.status === status && (!message || message.test(error.message)),
      )
      const response = await publicDownload(new NextRequest(`https://mes.example.test/api/public/shipment-documents/${id}/download`), { params: { id } })
      assert.equal(response.status, status)
      assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8', '失效电子档必须显示可读页面')
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
      const body = await response.text()
      assert.match(body, /发货单电子档不可用/)
      assert.match(body, /请联系发货方/)
      if (message) assert.match(body, message)
    }

    await expectPublicUnavailable(shipmentAttachments[1].id)
    await expectPublicUnavailable(shipment.id)
    await expectPublicUnavailable(randomUUID())
    await expectPublicUnavailable('not-a-uuid')

    for (const changedFields of [
      { ownerType: 'SALES_ORDER' },
      { documentType: shipmentPrintService.SHIPMENT_INTERNAL_PDF_TYPE },
      { mimeType: 'image/png' },
      { url: `/api/attachments/${customerAttachment.id}/file` },
      { ownerId: 'missing-shipment' },
      { deletedAt: new Date() },
    ]) {
      await prisma.documentAttachment.update({ where: { id: customerAttachment.id }, data: changedFields })
      await expectPublicUnavailable(customerAttachment.id)
      await prisma.documentAttachment.update({
        where: { id: customerAttachment.id },
        data: {
          ownerType: customerAttachment.ownerType, ownerId: customerAttachment.ownerId,
          documentType: customerAttachment.documentType, mimeType: customerAttachment.mimeType,
          url: customerAttachment.url, deletedAt: null,
        },
      })
    }

    await updateSystemSettings({ companyName: 'MES-lite 另一测试企业' })
    await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'customer' })
    assert.equal(await prisma.documentAttachment.count({ where: { ownerType: 'SHIPMENT', ownerId: shipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE } }), 2, '企业抬头变化后客户发货单必须生成新归档版本')
    await prisma.shipmentItem.update({ where: { id: shipmentItem.id }, data: { unitPrice: 18, totalAmount: 36 } })
    await prisma.shipment.update({ where: { id: shipment.id }, data: { unitPrice: 18, totalAmount: 36, note: '后补发货价格' } })
    await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'customer' })
    assert.equal(await prisma.documentAttachment.count({ where: { ownerType: 'SHIPMENT', ownerId: shipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE } }), 3, '发货源数据变化后必须保留历史快照并生成新版本')

    const forcedCustomerPdf = await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'customer', regenerate: true })
    assert.equal(await prisma.documentAttachment.count({ where: { ownerType: 'SHIPMENT', ownerId: shipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE } }), 4, '客户版手动重生成必须建立新的独立下载归档')
    assert.equal(forcedCustomerPdf.pdf.equals(customerPreview.pdf), false)
    assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(customerAttachment.id)).pdf.equals(customerPreview.pdf), true, '未填价格的纸单在后补价格、改抬头和重生成后，扫码仍须下载没有新增价格的原版')

    process.env.MES_PUBLIC_BASE_URL = 'https://new-mes.example.test'
    await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'customer' })
    const originArchives = await prisma.documentAttachment.findMany({
      where: { ownerType: 'SHIPMENT', ownerId: shipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE },
    })
    assert.equal(originArchives.length, 5, '公网地址改变后，不能继续复用嵌入旧地址的二维码')
    assert.ok(originArchives.some((attachment) => attachment.note?.includes(';download-origin=https://new-mes.example.test;')))
    assert.equal(new Set(originArchives.map((attachment) => attachment.url)).size, originArchives.length, '每份归档版本必须拥有独立下载地址')
    process.env.MES_PUBLIC_BASE_URL = 'https://mes.example.test'

    for (const [status, message] of [
      ['CANCELLED', /该单已取消/],
      ['REVERSED', /该单已冲销/],
      ['PENDING', /当前状态不支持下载/],
    ] as const) {
      await prisma.shipment.update({ where: { id: shipment.id }, data: { status } })
      await expectPublicUnavailable(customerAttachment.id, 410, message)
    }
    await prisma.shipment.update({ where: { id: shipment.id }, data: { status: 'SHIPPED', deletedAt: new Date() } })
    await expectPublicUnavailable(customerAttachment.id, 410, /该单已归档/)
    await prisma.shipment.update({ where: { id: shipment.id }, data: { status: 'DELIVERED', deletedAt: null } })
    assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(customerAttachment.id)).pdf.equals(customerPreview.pdf), true, '签收状态仍应允许获取对应历史电子档')

    const archiveCountBeforeMissingFile = await prisma.documentAttachment.count({ where: { ownerType: 'SHIPMENT', ownerId: shipment.id } })
    rmSync(customerAttachment.storagePath)
    await expectPublicUnavailable(customerAttachment.id, 404, /电子档文件暂不可用/)
    assert.equal(existsSync(customerAttachment.storagePath), false, '匿名下载不得重建丢失归档')
    assert.equal(await prisma.documentAttachment.count({ where: { ownerType: 'SHIPMENT', ownerId: shipment.id } }), archiveCountBeforeMissingFile, '匿名下载不得生成新归档版本')

    const legacyShipment = await prisma.shipment.create({
      data: {
        shipmentNo: `PRINT-LEGACY-${suffix}`, customer: '旧二维码发货单验证客户',
        status: 'SHIPPED', shippedAt: shipment.shippedAt,
        items: { create: { materialId: shipmentMaterial.id, locationId: sourceLocation.id, qty: 1, unitSnapshot: '件' } },
      },
    })
    const legacyStoragePath = join(uploadRoot, 'legacy-shipment.pdf')
    const legacyBytes = Buffer.from('%PDF-legacy-shipment-number-qr')
    writeFileSync(legacyStoragePath, legacyBytes)
    const legacyAttachment = await prisma.documentAttachment.create({
      data: {
        ownerType: 'SHIPMENT', ownerId: legacyShipment.id,
        documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE,
        originalName: `发货单-${legacyShipment.shipmentNo}.pdf`, fileName: 'legacy-shipment.pdf',
        mimeType: 'application/pdf', size: legacyBytes.byteLength, storagePath: legacyStoragePath,
        url: `/api/business-documents/shipment/${legacyShipment.id}/print?audience=customer`,
        note: `shipment-document:customer:v1:source=${legacyShipment.updatedAt.toISOString()};${businessDocumentPrintProfile(await getSystemSettings())}`,
      },
    })
    const upgradedLegacyPdf = await shipmentPrintService.resolveShipmentDocumentPdf(legacyShipment.id, { audience: 'customer' })
    assert.equal(upgradedLegacyPdf.pdf.equals(legacyBytes), false, '旧单号二维码归档不能作为新版扫码下载 PDF 缓存返回')
    assert.equal(upgradedLegacyPdf.pdf.subarray(0, 5).toString(), '%PDF-')
    assert.equal(await prisma.documentAttachment.count({ where: { ownerType: 'SHIPMENT', ownerId: legacyShipment.id } }), 2, '升级二维码必须保留原历史归档并新增客户版')
    assert.equal(readFileSync(legacyStoragePath).equals(legacyBytes), true)
    await expectPublicUnavailable(legacyAttachment.id)

    console.log('业务单据打印验证通过：通用/客户/内部归档、扫码下载原版、旧二维码升级、匿名权限边界与取消/冲销/归档说明符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
