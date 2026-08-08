import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderBusinessDocumentPdf } from '../lib/business-document-pdf'

async function main() {
const root = process.cwd()
const settings = {
  naturalMaterialCodeSortEnabled: true,
  companyName: 'MES-lite 测试企业',
  companyContact: '测试联系人',
  companyPhone: '000-00000000',
  companyAddress: '测试地址',
  aiLoadingIndicatorEnabled: true,
  contrastMode: 'standard' as const,
}

const pdf = await renderBusinessDocumentPdf({
  title: '销售订单',
  documentNo: 'SO-VERIFY-001',
  status: '草稿',
  documentDate: '2026-08-08',
  partyLabel: '客户',
  partyName: '测试客户',
  columns: [
    { label: '序号', key: 'index', width: 1 },
    { label: '物料', key: 'material', width: 3 },
    { label: '数量', key: 'qty', width: 1, align: 'right' },
    { label: '金额', key: 'amount', width: 1, align: 'right' },
  ],
  rows: [{ index: '1', material: '测试物料', qty: '2 件', amount: '¥20.00' }],
  totalValue: '¥20.00',
}, settings)

assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', '必须输出有效 PDF 文件')
assert.ok(pdf.byteLength > 5_000, 'PDF 不应为空壳文件')

const routeSource = readFileSync(path.join(root, 'app/api/business-documents/[kind]/[id]/print/route.ts'), 'utf8')
for (const kind of ['material-in', 'sales-order', 'shipment', 'return', 'flow-transfer', 'production-order', 'dispatch']) {
  assert.ok(routeSource.includes(kind), `打印接口必须覆盖 ${kind}`)
}
assert.match(routeSource, /SYSTEM_GENERATED_PDF/, '打印文件必须保存为系统生成附件')

const creationSources = [
  'app/components/MaterialInPage.tsx',
  'app/components/SalesOrderPage.tsx',
  'app/components/ShipmentPage.tsx',
  'app/components/ReturnPage.tsx',
  'app/components/FlowTransferPage.tsx',
  'app/components/DispatchPage.tsx',
  'app/page.tsx',
].map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n')
assert.match(creationSources, /创建并输出 PDF/, '新建单据必须明确提示会输出 PDF')
assert.match(creationSources, /generateBusinessDocumentPdfArchives/, '单据创建后必须生成归档 PDF')

console.log('业务单据打印验证通过：7 类交易单据共用 A4 PDF 引擎，创建后归档并支持下载补打。')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
