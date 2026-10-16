import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CustomerShipmentPrintData } from '../modules/sales/server/customer-shipment-pdf'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-business-documents-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const uploadRoot = join(verifyRoot, 'uploads')

const compactText = (value: string) => value.replace(/\s+/g, '')
const mmToPoints = (value: number) => value * 72 / 25.4

type PdfTextPosition = { str: string; pageIndex: number; x: number; y: number }

async function readPdfLayout(pdf: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise
  const items: PdfTextPosition[] = []
  try {
    for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex + 1)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item && item.str.trim()) items.push({ str: item.str, pageIndex, x: item.transform[4], y: item.transform[5] })
      }
    }
    return items.sort((a, b) => a.pageIndex - b.pageIndex || b.y - a.y || a.x - b.x)
  } finally {
    await document.destroy()
  }
}

const beforePosition = (a: PdfTextPosition, b: PdfTextPosition) => a.pageIndex < b.pageIndex
  || (a.pageIndex === b.pageIndex && a.y > b.y + 0.5)

async function inspectPdf(
  pdf: Buffer,
  expectedSizeMm: readonly [number, number],
  expectedContentBoundsMm?: readonly [number, number],
) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise
  const pages: string[] = []
  try {
    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex)
      const [left, bottom, right, top] = page.view
      assert.ok(Math.abs(right - left - mmToPoints(expectedSizeMm[0])) < 0.1, `第 ${pageIndex} 页 MediaBox 宽度必须为 ${expectedSizeMm[0]} mm`)
      assert.ok(Math.abs(top - bottom - mmToPoints(expectedSizeMm[1])) < 0.1, `第 ${pageIndex} 页 MediaBox 高度必须为 ${expectedSizeMm[1]} mm`)
      const content = await page.getTextContent()
      const pageText: string[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        pageText.push(item.str)
        const x = item.transform[4]
        const y = item.transform[5]
        assert.ok(x >= left - 0.5 && x + item.width <= right + 0.5, `第 ${pageIndex} 页文字横向不得超出纸张：${item.str}`)
        assert.ok(y >= bottom - 0.5 && y + item.height <= top + 0.5, `第 ${pageIndex} 页文字纵向不得超出纸张：${item.str}`)
        if (expectedContentBoundsMm) {
          const contentLeft = left + mmToPoints(expectedContentBoundsMm[0])
          const contentRight = left + mmToPoints(expectedContentBoundsMm[1])
          assert.ok(x >= contentLeft - 0.5 && x + item.width <= contentRight + 0.5, `第 ${pageIndex} 页正文必须处于 ${expectedContentBoundsMm[0]}..${expectedContentBoundsMm[1]} mm 横向范围内：${item.str}`)
        }
      }
      pages.push(compactText(pageText.join('')))
    }
    return pages
  } finally {
    await document.destroy()
  }
}

/** 按表头和首条正文定位左对齐列，跨页拼回正文，排除重复抬头、表头与续页标识。 */
async function readPdfTableColumn(pdf: Buffer, headerLabel: string, firstCellPrefix: string) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise
  const pages: Array<{ items: Array<{ str: string; transform: number[] }>; headerY: number }> = []
  let columnLeft: number | undefined
  try {
    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex)
      const content = await page.getTextContent()
      const items = content.items.flatMap((item) => 'str' in item ? [item] : [])
      const header = items.find((item) => compactText(item.str) === compactText(headerLabel))
      // 前置地址资料或尾部备注可独占一页，只有真正的明细页需要参与按列重建。
      if (!header) continue
      const firstCell = items.find((item) => item.str.startsWith(firstCellPrefix) && item.transform[5] < header.transform[5])
      if (columnLeft === undefined && firstCell) columnLeft = firstCell.transform[4]
      pages.push({ items, headerY: header.transform[5] })
    }
    assert.ok(typeof columnLeft === 'number', `没有找到目标列的首条正文：${firstCellPrefix}`)
    const textColumnLeft = columnLeft
    return compactText(pages.flatMap(({ items, headerY }) => items
      .filter((item) => item.transform[5] < headerY - 0.5 && Math.abs(item.transform[4] - textColumnLeft) < 0.1)
      .map((item) => item.str)).join(''))
  } finally {
    await document.destroy()
  }
}

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
  assert.match(shipmentPage, /audience="customer"\s+paper="continuous"\s+label="客户发货单·连续纸"/, '发货页面必须明确提供连续纸客户单据入口')
  assert.match(shipmentPage, /audience="customer"\s+paper="a4"\s+label="客户发货单·A4"/, '发货页面必须明确提供 A4 客户单据入口')
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
    { renderCustomerShipmentPdf },
    { businessDocumentPrintUrl },
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
    import('../modules/sales/server/customer-shipment-pdf'),
    import('../modules/business-documents/client/business-document-client'),
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
    for (const paper of ['continuous', 'a4'] as const) {
      const printUrl = new URL(businessDocumentPrintUrl('shipment', 'paper-url-verify', { audience: 'customer', paper }), 'https://mes.example.test')
      assert.equal(printUrl.pathname, '/api/business-documents/shipment/paper-url-verify/print')
      assert.equal(printUrl.searchParams.get('audience'), 'customer')
      assert.equal(printUrl.searchParams.get('paper'), paper, '客户纸型必须传递至统一打印 API')
      assert.equal(printUrl.searchParams.has('download'), false, '客户打印入口默认预览，不强制下载')
    }

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
    const shipmentCustomer = await prisma.customer.create({
      data: { code: `PRINT-SHIP-CUSTOMER-${suffix}`, name: '发货 PDF 验证客户', contact: '客户收货验证联系人', phone: '13800000000', address: '验证地址' },
    })
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNo: `PRINT-SH-${suffix}`, customerId: shipmentCustomer.id, customer: shipmentCustomer.name, customerPhone: '13800000000', address: '验证地址',
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
    assert.equal(customerPreview.filename, `发货单-${shipment.shipmentNo}-连续纸.pdf`)
    const internalArchive = await shipmentPrintService.resolveShipmentDocumentPdf(shipment.id, { audience: 'internal' })
    assert.equal(internalArchive.filename, `发货内部留档-${shipment.shipmentNo}.pdf`)
    assert.notEqual(internalArchive.pdf.equals(customerPreview.pdf), true, '客户版与内部留档应为明确不同的受众模板')
    const customerPages = await inspectPdf(customerPreview.pdf, [241, 140], [25.5, 215.5])
    assert.equal(customerPages.length, 1, '常规客户发货单必须在一张 241×140 mm 连续纸 PDF 内输出，不按复写联数重复内容')
    assert.equal(customerPages.join('').split('客户发货单').length - 1, 1, '一张多联复写纸只需要打印一次客户发货单')
    assert.ok(customerPages[0].includes(compactText(shipment.shipmentNo)))
    assert.ok(customerPages[0].includes(compactText(shipment.customer)))
    const customerLayout = await readPdfLayout(customerPreview.pdf)
    const customerHeader = customerLayout.find((item) => compactText(item.str) === '物料编码')
    const customerContact = customerLayout.find((item) => item.str.includes(shipmentCustomer.contact || ''))
    assert.ok(customerHeader && customerContact && beforePosition(customerContact, customerHeader), '客户主数据联系人必须进入 PDF 且位于首个明细表头之前')
    await inspectPdf(internalArchive.pdf, [210, 297])

    const addressSegments = Array.from({ length: 12 }, (_, index) => `地址区域${String(index + 1).padStart(2, '0')}号厂房收货位置ADDR${String(index + 1).padStart(2, '0')}END`)
    const noteSegments = Array.from({ length: 30 }, (_, index) => `备注第${String(index + 1).padStart(2, '0')}段请按明细核对包装并保留签收凭证NOTE${String(index + 1).padStart(2, '0')}END。`)
    const stressData = {
      shipmentNo: 'CONTINUOUS-PAPER-032', shippedAt: '2026/10/16 09:30:00',
      customer: '连续纸分页验证客户', customerContact: '验证收货联系人', customerPhone: '13800000000', address: addressSegments.join('；'),
      companyName: '连续纸分页验证企业', companyContact: '验证联系人', companyPhone: '13900000000', companyAddress: '验证企业地址',
      voucherNo: 'VOUCHER-CONTINUOUS', trackingNo: 'TRACK-CONTINUOUS', note: noteSegments.join(''),
      rows: Array.from({ length: 32 }, (_, index) => [
        String(index + 1), `CP-MAT-${String(index + 1).padStart(2, '0')}`,
        `连续纸物料${String(index + 1).padStart(2, '0')}号 规格M${index + 1}`,
        `${index + 1} 件`, '¥12.50', `¥${((index + 1) * 12.5).toFixed(2)}`,
      ]),
      total: '¥6600.00', packages: 'PKG-CONTINUOUS（528 件）',
    }
    const oversizedRowSegments = Array.from({ length: 96 }, (_, index) => `超长物料说明第${String(index + 1).padStart(2, '0')}段HUGE${String(index + 1).padStart(2, '0')}END。`)
    const customerPaperCases = [
      { paper: 'continuous', size: [241, 140], bounds: [25.5, 215.5], label: '连续纸' },
      { paper: 'a4', size: [210, 297], bounds: [10, 200], label: 'A4' },
    ] as const
    const verifyCustomerPageSections = async (pdf: Buffer, pages: string[], data: CustomerShipmentPrintData, label: string) => {
      const text = pages.join('')
      const layout = await readPdfLayout(pdf)
      const firstTableHeader = layout.find((item) => compactText(item.str) === '物料编码')
      assert.ok(firstTableHeader, `${label} 必须提供明细表头`)
      const totals = layout.filter((item) => compactText(item.str).startsWith('合计：'))
      assert.equal(totals.length, 1, `${label} 整单合计必须且只能出现一次`)
      const total = totals[0]
      assert.ok(compactText(total.str).includes(compactText(data.total)), `${label} 合计必须保留正确总金额`)
      const withoutPageFurniture = (items: PdfTextPosition[]) => compactText(items
        .filter((item) => !/^第\s*\d+\s*\/\s*\d+\s*页$/.test(item.str)
          && !compactText(item.str).startsWith(`发货单号：${compactText(data.shipmentNo)}`)
          && !['如需电子档，请扫描', '二维码获取', '序号', '物料编码', '物料名称/规格', '数量', '单价', '金额'].includes(item.str))
        .map((item) => item.str).join(''))
        .replace(/(?:收货方|收货联系人|收货电话|收货地址|供货方|供货联系人|供货电话|供货地址|客户凭证号|物流单号|包裹|备注)（续）：/g, '')
      const frontMatter = layout.filter((item) => beforePosition(item, firstTableHeader))
      const receiver = frontMatter.find((item) => compactText(item.str).startsWith('收货方：'))
      const supplier = frontMatter.find((item) => compactText(item.str).startsWith('供货方：'))
      assert.ok(receiver && supplier, `${label} 明细前必须提供收货方和供货方两栏`)
      assert.equal(receiver.pageIndex, supplier.pageIndex, `${label} 收货方和供货方首行必须在同页并排`)
      assert.ok(Math.abs(receiver.y - supplier.y) < 0.5, `${label} 收货方和供货方首行必须水平对齐`)
      assert.ok(receiver.x < supplier.x, `${label} 收货方必须位于左栏、供货方位于右栏`)
      const partyColumns = [
        { name: '收货方左栏', items: frontMatter.filter((item) => item.x < supplier.x - 0.5), values: [data.customer, data.customerContact, data.customerPhone, data.address], fields: ['收货方', '收货联系人', '收货电话', '收货地址'] },
        { name: '供货方右栏', items: frontMatter.filter((item) => item.x >= supplier.x - 0.5), values: [data.companyName, data.companyContact, data.companyPhone, data.companyAddress], fields: ['供货方', '供货联系人', '供货电话', '供货地址'] },
      ]
      for (const column of partyColumns) {
        const columnText = withoutPageFurniture(column.items)
        for (const value of column.values) {
          assert.ok(columnText.includes(compactText(value)), `${label} ${column.name}的名称、联系人、电话和跨页地址必须完整且保留在原栏：${value}`)
        }
        for (const field of column.fields) {
          assert.ok(column.items.some((item) => compactText(item.str).startsWith(`${field}：`)), `${label} ${field}必须位于明细前的${column.name}`)
        }
      }
      const firstName = data.rows[0][2].slice(0, 8)
      const firstNameCell = layout.find((item) => item.str.startsWith(firstName) && beforePosition(firstTableHeader, item))
      assert.ok(firstNameCell, `${label} 必须找到明细物料名称列`)
      const rowFragments = layout.filter((item) => Math.abs(item.x - firstNameCell.x) < 0.1
        && beforePosition(firstTableHeader, item) && beforePosition(item, total))
      const lastRowFragment = rowFragments.at(-1)
      assert.ok(lastRowFragment, `${label} 合计前必须保留明细内容`)
      assert.equal(total.pageIndex, lastRowFragment.pageIndex, `${label} 合计必须与最后一条明细的末段在同页`)
      assert.ok(lastRowFragment.y - total.y <= 30, `${label} 合计必须紧接明细，不能被大块留白分隔`)
      for (const field of ['客户凭证号', '包裹', '备注']) {
        const position = layout.find((item) => compactText(item.str).startsWith(`${field}：`))
        assert.ok(position && beforePosition(total, position), `${label} ${field}必须位于合计之后`)
      }
      const tracking = layout.find((item) => compactText(item.str).includes('物流单号：'))
      assert.ok(tracking && beforePosition(total, tracking), `${label} 物流单号必须位于合计之后`)
      const tailText = withoutPageFurniture(layout.filter((item) => beforePosition(total, item)))
      for (const value of [data.voucherNo, data.trackingNo, data.packages, data.note]) {
        assert.ok(tailText.includes(compactText(value)), `${label} 合计后的凭证、物流、包裹与跨页备注必须保留完整内容：${value}`)
      }
      for (const firstPageText of ['客户发货单', data.customer, data.companyName]) {
        assert.ok(pages[0].includes(compactText(firstPageText)), `${label} 第一页必须提供完整标题、企业和客户信息：${firstPageText}`)
        assert.equal(text.split(compactText(firstPageText)).length - 1, 1, `${label} 完整抬头只应在第一页出现一次：${firstPageText}`)
      }
      pages.forEach((pageText, index) => {
        assert.ok(pageText.includes(compactText(data.shipmentNo)), `${label} 第 ${index + 1} 页必须提供单号`)
        if (pageText.includes('物料编码')) {
          for (const header of ['物料名称', '数量', '单价', '金额']) {
            assert.ok(pageText.includes(header), `${label} 第 ${index + 1} 页的明细表头必须完整：${header}`)
          }
        }
        assert.ok(pageText.includes(`第${index + 1}/${pages.length}页`), `${label} 第 ${index + 1} 页必须提供准确页码`)
        if (index > 0) {
          for (const firstPageOnlyText of ['客户发货单', data.customer, data.companyName, '如需电子档', '二维码获取']) {
            assert.equal(pageText.includes(compactText(firstPageOnlyText)), false, `${label} 第 ${index + 1} 页不得重复完整抬头或二维码说明：${firstPageOnlyText}`)
          }
        }
        if (index < pages.length - 1) {
          for (const closingText of ['乙方发货人', '甲方收货人', '签收日期', '本单用于发货交接、签收和对账']) {
            assert.equal(pageText.includes(closingText), false, `${label} 第 ${index + 1} 页不得提前出现签收栏或说明：${closingText}`)
          }
        }
      })
      const lastPage = pages.at(-1) || ''
      for (const finalText of ['乙方发货人', '甲方收货人', '签收日期', '本单用于发货交接、签收和对账']) {
        assert.ok(lastPage.includes(compactText(finalText)), `${label} 最后一页必须保留签收栏和说明：${finalText}`)
      }
    }
    for (const paperCase of customerPaperCases) {
      const singlePageData = {
        ...stressData, address: '单页验证收货地址', note: '单页布局验证',
        rows: [stressData.rows[0]], total: '¥12.50',
      }
      const singlePagePdf = await renderCustomerShipmentPdf(singlePageData, 'https://mes.example.test/api/public/shipment-documents/00000000-0000-4000-8000-000000000002/download', paperCase.paper)
      const singlePages = await inspectPdf(singlePagePdf, paperCase.size, paperCase.bounds)
      assert.equal(singlePages.length, 1, `${paperCase.label} 普通单行单据不应因重新排版多打一页`)
      await verifyCustomerPageSections(singlePagePdf, singlePages, singlePageData, `${paperCase.label} 单页`)
      const stressPdf = await renderCustomerShipmentPdf(stressData, 'https://mes.example.test/api/public/shipment-documents/00000000-0000-4000-8000-000000000000/download', paperCase.paper)
      const stressPages = await inspectPdf(stressPdf, paperCase.size, paperCase.bounds)
      assert.ok(stressPages.length > 1, `${paperCase.label} 大量明细、长地址及长备注必须自动分页`)
      await verifyCustomerPageSections(stressPdf, stressPages, stressData, paperCase.label)
      const stressText = stressPages.join('')
      for (const row of stressData.rows) {
        assert.equal(stressText.split(row[1]).length - 1, 1, `${paperCase.label} 分页后明细 ${row[1]} 必须完整且仅出现一次`)
        assert.ok(stressText.includes(compactText(row[2])), `${paperCase.label} 分页后物料名称不得截断：${row[2]}`)
      }
      const oversizedRowData = {
        ...stressData, address: '普通验证收货地址', note: '超高明细跨页验证',
        rows: [['1', 'CP-OVERSIZED', oversizedRowSegments.join(''), '1 件', '¥12.50', '¥12.50']], total: '¥12.50',
      }
      const oversizedRowPdf = await renderCustomerShipmentPdf(oversizedRowData, 'https://mes.example.test/api/public/shipment-documents/00000000-0000-4000-8000-000000000001/download', paperCase.paper)
      const oversizedRowPages = await inspectPdf(oversizedRowPdf, paperCase.size, paperCase.bounds)
      assert.ok(oversizedRowPages.length > 1, `${paperCase.label} 单个超高明细行必须跨页续打，不得裁切或循环创建空页`)
      await verifyCustomerPageSections(oversizedRowPdf, oversizedRowPages, oversizedRowData, `${paperCase.label} 超高行`)
      const oversizedRowText = await readPdfTableColumn(oversizedRowPdf, '物料名称/规格', '超长物料说明第01段')
      assert.equal(oversizedRowText, compactText(oversizedRowSegments.join('')), `${paperCase.label} 单个超高明细行跨页后，按列重建的全部正文必须与原文完全一致`)
      for (const addressCase of [
        { field: 'address', name: '收货地址', output: 'oversized-address' },
        { field: 'companyAddress', name: '供货地址', output: 'oversized-supplier-address' },
      ] as const) {
        const oversizedAddressData = {
          ...singlePageData,
          [addressCase.field]: Array.from({ length: 240 }, (_, index) => `长地址区域${String(index + 1).padStart(3, '0')}号厂房收货位置LONGADDR${String(index + 1).padStart(3, '0')}END。`).join(''),
        }
        const oversizedAddressPdf = await renderCustomerShipmentPdf(oversizedAddressData, 'https://mes.example.test/api/public/shipment-documents/00000000-0000-4000-8000-000000000003/download', paperCase.paper)
        const oversizedAddressPages = await inspectPdf(oversizedAddressPdf, paperCase.size, paperCase.bounds)
        await verifyCustomerPageSections(oversizedAddressPdf, oversizedAddressPages, oversizedAddressData, `${paperCase.label} 超长${addressCase.name}`)
        const oversizedAddressLayout = await readPdfLayout(oversizedAddressPdf)
        const delayedTable = oversizedAddressLayout.find((item) => compactText(item.str) === '物料编码')
        assert.ok(delayedTable && delayedTable.pageIndex > 0, `${paperCase.label} 超长${addressCase.name}必须先完整流式分页，再开始明细`)
        assert.equal(oversizedAddressPages[0].includes('物料编码'), false, `${paperCase.label} 纯前置资料页无需打印空的明细表头`)
        if (process.env.PDF_VERIFY_OUTPUT_DIR) {
          mkdirSync(process.env.PDF_VERIFY_OUTPUT_DIR, { recursive: true })
          writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, `customer-${paperCase.paper}-${addressCase.output}.pdf`), oversizedAddressPdf)
        }
      }
      if (process.env.PDF_VERIFY_OUTPUT_DIR) {
        mkdirSync(process.env.PDF_VERIFY_OUTPUT_DIR, { recursive: true })
        writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, `customer-${paperCase.paper}-single-page.pdf`), singlePagePdf)
        writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, `customer-${paperCase.paper}-multipage.pdf`), stressPdf)
        writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, `customer-${paperCase.paper}-oversized-row.pdf`), oversizedRowPdf)
      }
    }
    if (process.env.PDF_VERIFY_OUTPUT_DIR) {
      mkdirSync(process.env.PDF_VERIFY_OUTPUT_DIR, { recursive: true })
      writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, 'customer-delivery.pdf'), customerPreview.pdf)
      writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, 'internal-archive.pdf'), internalArchive.pdf)
    }
    const twoPaperShipment = await prisma.shipment.create({
      data: {
        shipmentNo: `PRINT-PAPERS-${suffix}`, customer: '双纸型独立归档验证客户', customerPhone: '13800000001', address: '双纸型验证地址',
        status: 'SHIPPED', shippedAt: new Date('2026-10-16T01:00:00.000Z'), qty: 2, unitPrice: 12, totalAmount: 24,
        items: { create: { materialId: shipmentMaterial.id, locationId: sourceLocation.id, qty: 2, unitSnapshot: '件', unitPrice: 12, totalAmount: 24 } },
      },
    })
    const twoPaperWhere = { ownerType: 'SHIPMENT', ownerId: twoPaperShipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE }
    const firstContinuous = await shipmentPrintService.resolveShipmentDocumentPdf(twoPaperShipment.id, { audience: 'customer', paper: 'continuous' })
    const firstA4 = await shipmentPrintService.resolveShipmentDocumentPdf(twoPaperShipment.id, { audience: 'customer', paper: 'a4' })
    assert.equal(firstContinuous.filename, `发货单-${twoPaperShipment.shipmentNo}-连续纸.pdf`)
    assert.equal(firstA4.filename, `发货单-${twoPaperShipment.shipmentNo}-A4.pdf`)
    assert.equal((await inspectPdf(firstContinuous.pdf, [241, 140], [25.5, 215.5])).length, 1)
    assert.equal((await inspectPdf(firstA4.pdf, [210, 297], [10, 200])).length, 1)
    const firstPaperArchives = await prisma.documentAttachment.findMany({ where: twoPaperWhere })
    assert.equal(firstPaperArchives.length, 2, '两种客户纸型必须分别建立归档')
    assert.equal(new Set(firstPaperArchives.map((attachment) => attachment.url)).size, 2, '两种客户纸型必须拥有独立二维码地址')
    for (const paperCase of customerPaperCases) {
      const initialPdf = paperCase.paper === 'continuous' ? firstContinuous : firstA4
      const archive = firstPaperArchives.find((attachment) => attachment.note?.includes(`paper=${paperCase.size[0]}x${paperCase.size[1]}mm;`))
      assert.ok(archive, `${paperCase.label} 归档必须记录独立纸型 profile`)
      const reused = await shipmentPrintService.resolveShipmentDocumentPdf(twoPaperShipment.id, { audience: 'customer', paper: paperCase.paper })
      assert.equal(reused.pdf.equals(initialPdf.pdf), true, `${paperCase.label} 交替补打两种纸型时必须复用自己的归档`)
      assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(archive.id)).pdf.equals(initialPdf.pdf), true, `${paperCase.label} 二维码必须返回对应纸型的原 PDF`)
    }
    assert.equal(await prisma.documentAttachment.count({ where: twoPaperWhere }), 2, '切换纸型不得互相击穿缓存或增加重复归档')

    await prisma.shipment.update({ where: { id: twoPaperShipment.id }, data: { note: '两种纸型共同新增的客户可见说明' } })
    const changedContinuous = await shipmentPrintService.resolveShipmentDocumentPdf(twoPaperShipment.id, { audience: 'customer', paper: 'continuous' })
    assert.equal(await prisma.documentAttachment.count({ where: twoPaperWhere }), 3, '可见内容变化后先打印连续纸只应增加连续纸归档')
    const changedA4 = await shipmentPrintService.resolveShipmentDocumentPdf(twoPaperShipment.id, { audience: 'customer', paper: 'a4' })
    const changedPaperArchives = await prisma.documentAttachment.findMany({ where: twoPaperWhere })
    assert.equal(changedPaperArchives.length, 4, '可见内容变化后两种纸型应各自新增一个版本')
    assert.equal(new Set(changedPaperArchives.map((attachment) => attachment.url)).size, 4, '两种纸型的所有修订都必须拥有独立二维码')
    for (const paperCase of customerPaperCases) {
      const profilePaper = `paper=${paperCase.size[0]}x${paperCase.size[1]}mm;`
      const initialPdf = paperCase.paper === 'continuous' ? firstContinuous : firstA4
      const changedPdf = paperCase.paper === 'continuous' ? changedContinuous : changedA4
      assert.equal(changedPdf.pdf.equals(initialPdf.pdf), false, `${paperCase.label} 客户可见内容变化必须生成新版`)
      assert.equal(changedPaperArchives.filter((attachment) => attachment.note?.includes(profilePaper)).length, 2, `${paperCase.label} 应保留两个独立版本`)
      const initialArchive = firstPaperArchives.find((attachment) => attachment.note?.includes(profilePaper))
      const changedArchive = changedPaperArchives.find((attachment) => attachment.note?.includes(profilePaper) && !firstPaperArchives.some((first) => first.id === attachment.id))
      assert.ok(initialArchive && changedArchive)
      assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(initialArchive.id)).pdf.equals(initialPdf.pdf), true, `${paperCase.label} 内容更新后旧二维码仍须读取旧 PDF`)
      assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(changedArchive.id)).pdf.equals(changedPdf.pdf), true, `${paperCase.label} 新二维码须读取新 PDF`)
      const reused = await shipmentPrintService.resolveShipmentDocumentPdf(twoPaperShipment.id, { audience: 'customer', paper: paperCase.paper })
      assert.equal(reused.pdf.equals(changedPdf.pdf), true, `${paperCase.label} 另一个纸型更新后仍须复用本纸型最新归档`)
    }
    assert.equal(await prisma.documentAttachment.count({ where: twoPaperWhere }), 4, '两种纸型的新版本交替补打不得重复归档')
    const previousLayoutShipment = await prisma.shipment.create({
      data: {
        shipmentNo: `PRINT-PREVIOUS-LAYOUT-${suffix}`, customer: '版式升级验证客户', status: 'SHIPPED', shippedAt: shipment.shippedAt,
        items: { create: { materialId: shipmentMaterial.id, locationId: sourceLocation.id, qty: 1, unitSnapshot: '件' } },
      },
    })
    const previousLayoutWhere = { ownerType: 'SHIPMENT', ownerId: previousLayoutShipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE }
    for (const paperCase of customerPaperCases) {
      const originalPdf = await shipmentPrintService.resolveShipmentDocumentPdf(previousLayoutShipment.id, { audience: 'customer', paper: paperCase.paper })
      const paperProfile = `paper=${paperCase.size[0]}x${paperCase.size[1]}mm;`
      const originalArchive = await prisma.documentAttachment.findFirstOrThrow({ where: { ...previousLayoutWhere, note: { contains: paperProfile } } })
      assert.ok(originalArchive.note?.startsWith(`shipment-document:customer:v4:${paperProfile}`), `${paperCase.label} 新归档必须记录 v4 版式`)
      await prisma.documentAttachment.update({
        where: { id: originalArchive.id },
        data: { note: (originalArchive.note || '').replace('shipment-document:customer:v4:', 'shipment-document:customer:v3:') },
      })
      const upgradedPdf = await shipmentPrintService.resolveShipmentDocumentPdf(previousLayoutShipment.id, { audience: 'customer', paper: paperCase.paper })
      assert.equal(upgradedPdf.pdf.equals(originalPdf.pdf), false, `${paperCase.label} 旧 v3 版式不能命中新 v4 缓存，必须生成独立二维码的新归档`)
      const paperArchives = await prisma.documentAttachment.findMany({ where: { ...previousLayoutWhere, note: { contains: paperProfile } } })
      assert.equal(paperArchives.length, 2, `${paperCase.label} 升级版式必须保留 v3 档案并新增 v4 档案`)
      assert.equal(paperArchives.filter((archive) => archive.note?.startsWith('shipment-document:customer:v4:')).length, 1)
      assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(originalArchive.id)).pdf.equals(originalPdf.pdf), true, `${paperCase.label} 版式升级后旧 v3 二维码仍必须返回原 PDF 字节`)
      const reusedPdf = await shipmentPrintService.resolveShipmentDocumentPdf(previousLayoutShipment.id, { audience: 'customer', paper: paperCase.paper })
      assert.equal(reusedPdf.pdf.equals(upgradedPdf.pdf), true, `${paperCase.label} 升级后的补打应复用新版，不能反复产生归档`)
      assert.equal(await prisma.documentAttachment.count({ where: { ...previousLayoutWhere, note: { contains: paperProfile } } }), 2)
    }
    if (process.env.PDF_VERIFY_OUTPUT_DIR) {
      writeFileSync(join(process.env.PDF_VERIFY_OUTPUT_DIR, 'customer-a4.pdf'), firstA4.pdf)
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
    assert.match(customerAttachment.note || '', /shipment-document:customer:v4:paper=241x140mm;[\s\S]*download-origin=https:\/\/mes\.example\.test;/)
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
        shipmentNo: `PRINT-LEGACY-${suffix}`, customerId: shipmentCustomer.id, customer: '旧二维码发货单验证客户',
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

    const contentArchiveWhere = { ownerType: 'SHIPMENT', ownerId: legacyShipment.id, documentType: shipmentPrintService.SHIPMENT_CUSTOMER_PDF_TYPE }
    const originalContentArchive = await prisma.documentAttachment.findFirstOrThrow({ where: { ...contentArchiveWhere, id: { not: legacyAttachment.id } } })
    const previousA4Pdf = await renderBusinessDocumentPdf({
      title: '客户发货单', documentNo: legacyShipment.shipmentNo, status: '已发货', documentDate: '2026-08-18',
      partyLabel: '客户', partyName: legacyShipment.customer,
      columns: [{ label: '物料', key: 'material', width: 1 }, { label: '数量', key: 'qty', width: 1 }],
      rows: [{ material: shipmentMaterial.name, qty: '1 件' }],
    }, await getSystemSettings())
    writeFileSync(originalContentArchive.storagePath, previousA4Pdf)
    await prisma.documentAttachment.update({
      where: { id: originalContentArchive.id },
      data: {
        size: previousA4Pdf.byteLength,
        note: (originalContentArchive.note || '').replace('shipment-document:customer:v4:paper=241x140mm;', 'shipment-document:customer:v2:'),
      },
    })
    const upgradedA4Pdf = await shipmentPrintService.resolveShipmentDocumentPdf(legacyShipment.id, { audience: 'customer' })
    assert.equal(upgradedA4Pdf.pdf.equals(previousA4Pdf), false, '旧 A4 客户归档不得命中新 241×140 mm 连续纸模板的缓存')
    await inspectPdf(upgradedA4Pdf.pdf, [241, 140], [25.5, 215.5])
    assert.equal(await prisma.documentAttachment.count({ where: contentArchiveWhere }), 3, '多联连续纸模板升级必须保留旧 A4 归档并创建新版')
    assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(originalContentArchive.id)).pdf.equals(previousA4Pdf), true, '已有 A4 纸单的二维码在模板升级后仍须读取原始 A4 字节')
    const contentItem = await prisma.shipmentItem.findFirstOrThrow({ where: { shipmentId: legacyShipment.id } })
    let contentPdf = upgradedA4Pdf
    let contentArchiveCount = 3
    const expectCustomerReuse = async (reason: string) => {
      const nextPdf = await shipmentPrintService.resolveShipmentDocumentPdf(legacyShipment.id, { audience: 'customer' })
      assert.equal(nextPdf.pdf.equals(contentPdf.pdf), true, reason)
      assert.equal(await prisma.documentAttachment.count({ where: contentArchiveWhere }), contentArchiveCount, '客户可见内容不变时不能增加 PDF 归档')
    }
    const expectCustomerVersion = async (reason: string) => {
      const nextPdf = await shipmentPrintService.resolveShipmentDocumentPdf(legacyShipment.id, { audience: 'customer' })
      assert.equal(nextPdf.pdf.equals(contentPdf.pdf), false, reason)
      contentArchiveCount += 1
      assert.equal(await prisma.documentAttachment.count({ where: contentArchiveWhere }), contentArchiveCount, '客户可见内容变化必须建立新的 PDF 归档')
      contentPdf = nextPdf
    }

    const unrelatedChange = await prisma.shipment.update({
      where: { id: legacyShipment.id },
      data: { updatedAt: new Date(legacyShipment.updatedAt.getTime() + 60_000), shippedBy: '调整内部发货人员', shippedCostAmount: 999, status: 'DELIVERED', note: '' },
    })
    assert.notEqual(unrelatedChange.updatedAt.getTime(), legacyShipment.updatedAt.getTime())
    await prisma.shipmentItem.update({ where: { id: contentItem.id }, data: { shippedCostAmount: 999 } })
    await expectCustomerReuse('更新时间、内部发货人员、成本和签收状态变化不能产生新的客户版；空备注与未填备注显示一致')
    await updateSystemSettings({ businessDocumentPrintDensity: 'standard', businessDocumentPrintMarginMm: 20 })
    await expectCustomerReuse('通用内部打印密度和页边距不影响客户模板，不能产生新的客户 PDF')

    const stableShipmentUpdatedAt = unrelatedChange.updatedAt.getTime()
    await prisma.customer.update({ where: { id: shipmentCustomer.id }, data: { contact: '更正后的收货联系人' } })
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: legacyShipment.id } })).updatedAt.getTime(), stableShipmentUpdatedAt, '客户联系人变化不会更新发货单时间戳')
    await expectCustomerVersion('客户主数据收货联系人变化后即使未更新发货单时间戳，也必须生成新版')
    assert.ok((await inspectPdf(contentPdf.pdf, [241, 140], [25.5, 215.5])).join('').includes('更正后的收货联系人'), '新版必须读取客户主数据中更正后的收货联系人')
    await prisma.material.update({ where: { id: shipmentMaterial.id }, data: { name: '客户版新物料名称' } })
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: legacyShipment.id } })).updatedAt.getTime(), stableShipmentUpdatedAt, '物料主数据变化不会更新发货单时间戳')
    await expectCustomerVersion('已展示物料名称变化即使未更新发货单时间戳，也必须生成新版')

    const contentPackage = await prisma.packageDocument.create({
      data: {
        packageNo: `PKG-CONTENT-${suffix}`, shipmentId: legacyShipment.id, packedBy: '内容版本验证包装员',
        items: { create: { shipmentItemId: contentItem.id, materialId: shipmentMaterial.id, quantity: 1, unitSnapshot: '件' } },
      },
      include: { items: true },
    })
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: legacyShipment.id } })).updatedAt.getTime(), stableShipmentUpdatedAt)
    await expectCustomerVersion('新增已展示的包裹概要必须生成新版，即使发货单时间戳未变化')
    await prisma.packageDocumentItem.update({ where: { id: contentPackage.items[0].id }, data: { quantity: 2 } })
    assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: legacyShipment.id } })).updatedAt.getTime(), stableShipmentUpdatedAt)
    await expectCustomerVersion('包裹显示数量变化必须生成新版，即使发货单时间戳未变化')

    await prisma.shipmentItem.update({ where: { id: contentItem.id }, data: { unitPrice: 18, totalAmount: 18 } })
    await prisma.shipment.update({ where: { id: legacyShipment.id }, data: { unitPrice: 18, totalAmount: 18 } })
    await expectCustomerVersion('后补客户可见价格必须生成新版')
    await prisma.shipmentItem.update({ where: { id: contentItem.id }, data: { unitPrice: 18.001, totalAmount: 18.001 } })
    await prisma.shipment.update({ where: { id: legacyShipment.id }, data: { unitPrice: 18.001, totalAmount: 18.001 } })
    await expectCustomerReuse('原始金额变化但两位小数打印结果相同时，应复用原客户 PDF')
    await prisma.shipment.update({ where: { id: legacyShipment.id }, data: { note: '新增客户可见备注' } })
    await expectCustomerVersion('单独更改客户可见备注必须生成新版')
    await prisma.shipmentItem.update({ where: { id: contentItem.id }, data: { qty: 2 } })
    await expectCustomerVersion('单独更改明细显示数量必须生成新版')

    const firstVisibleStatePdf = contentPdf
    await prisma.shipment.update({ where: { id: legacyShipment.id }, data: { note: '客户说明改为第二版' } })
    await expectCustomerVersion('客户说明由 A 改为 B 必须建立新的归档')
    await prisma.shipment.update({ where: { id: legacyShipment.id }, data: { note: '新增客户可见备注' } })
    await expectCustomerVersion('客户说明由 B 改回 A 必须建立第三个版本，不能回跳历史 A 的二维码')
    assert.equal(contentPdf.pdf.equals(firstVisibleStatePdf.pdf), false, '恢复同样的可见内容也必须保留本次修订的独立二维码')
    await prisma.shipment.update({ where: { id: legacyShipment.id }, data: { deliveredBy: '更正内部签收人员', deliveredAt: new Date() } })
    await expectCustomerReuse('最新版本之后仅更新内部签收信息，应复用最新客户 PDF')
    assert.equal((await shipmentPrintService.resolvePublicShipmentDocumentPdf(originalContentArchive.id)).pdf.equals(previousA4Pdf), true, '所有内容修订后，原 A4 二维码仍需返回当时归档的字节')

    console.log('业务单据打印验证通过：连续纸/A4 双 PDF 与独立归档、190 mm 正文、收发货资料左右分栏与双侧超长地址分页、明细紧接合计和末页签收、长备注/超高明细完整性、v3/v4 版式及旧二维码、客户联系人版本判定、内部 A4、匿名权限边界与取消/冲销/归档说明符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
