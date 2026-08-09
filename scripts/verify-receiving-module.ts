import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import { createMaterialInSchema } from '@/modules/receiving/contracts/material-in-schema'
import {
  archiveMaterialIn,
  createMaterialIns,
  listMaterialIns,
  MaterialInDomainError,
} from '@/modules/receiving/server/material-in-service'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function verifySchemaAndBoundaries() {
  assert.equal(createMaterialInSchema.safeParse({ supplierId: '', items: [] }).success, false, '来料单必须有供应商和至少一项物料')
  const validItem = { materialId: 'material', locationId: 'location', qty: 2, unitPrice: 3, pieceCount: 2, priceUnit: '件' }
  assert.equal(createMaterialInSchema.safeParse({ supplierId: 'supplier', items: [validItem] }).success, true, '多物料来料请求必须可解析')
  assert.equal(createMaterialInSchema.safeParse({ supplierId: 'supplier', items: Array.from({ length: 101 }, () => validItem) }).success, false, '单张来料单最多允许 100 项')

  const route = read('app/api/material-ins/route.ts')
  const service = read('modules/receiving/server/material-in-service.ts')
  const page = read('modules/receiving/ui/MaterialInPage.tsx')
  const editor = read('modules/receiving/ui/MaterialInEditorDialog.tsx')
  const select = read('app/components/SearchableSelect.tsx')
  assert.match(route, /material-in-service/, '来料 API 必须委托领域服务')
  assert.doesNotMatch(route, /@\/lib\/prisma|prisma\.|\$transaction|resolveMaterialInPricing|resolveMaterialInStockQuantity/, '来料 API 不得保留数据库和计价规则')
  assert.ok(route.split('\n').length <= 100, '来料 API 必须保持不超过 100 行的薄适配层')
  assert.doesNotMatch(service, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '来料领域服务不得依赖 HTTP、权限或请求审计')
  assert.match(service, /tokenizeKeywordQuery/, '来料查询必须保留空格分隔的多关键词搜索')
  assert.match(service, /\$transaction[\s\S]*createMaterialInLine/, '多物料来料单必须在同一事务创建')
  assert.doesNotMatch(page, /fetch\(/, '来料页面不得直接发起 HTTP 请求')
  assert.match(page, /MaterialInCollectionView/, '来料页面必须委托集合视图')
  assert.match(page, /MaterialInEditorDialog/, '来料页面必须委托编辑任务')
  assert.match(editor, /SearchableSelect[\s\S]*onSearch=/, '来料编辑必须复用支持异步联想的公共搜索选择器')
  assert.match(select, /onSearch\?:[\s\S]*window\.setTimeout/, '公共搜索选择器必须提供防抖异步联想契约')
  assert.ok(page.split('\n').length <= 800, '来料主页必须保持在 800 行以内')
}

async function verifyDatabaseRules() {
  const suffix = randomUUID().slice(0, 8)
  const [supplier, location, material] = await Promise.all([
    prisma.supplier.create({ data: { code: `VERIFY-SUP-${suffix}`, name: `验证供应商 ${suffix}` } }),
    prisma.inventoryLocation.create({ data: { code: `VERIFY-IN-${suffix}`, name: `验证收货位 ${suffix}`, isDefault: true } }),
    prisma.material.create({
      data: {
        code: `VERIFY-RAW-${suffix}`,
        name: `验证铝材 ${suffix}`,
        unit: 'm',
        stockUnit: 'm',
        valuationUnit: 'kg',
        primaryMeasure: 'LENGTH',
        referenceMeasure: 'WEIGHT',
        conversionRate: 2,
      },
    }),
  ])

  const input = createMaterialInSchema.parse({
    supplierId: supplier.id,
    voucherNo: `V-${suffix}`,
    items: [{
      materialId: material.id,
      locationId: location.id,
      qty: 5,
      pieceCount: 2,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 5,
      totalLength: 5,
      totalWeight: 12,
      unitPrice: 4,
      priceUnit: 'kg',
      priceBasis: 'VALUATION',
    }],
  })
  const created = await createMaterialIns(input)
  assert.equal(created.items.length, 1, '领域服务必须创建请求中的全部来料明细')
  assert.equal(created.first.qty, 5, '长度型物料必须按实测总长度入账')
  assert.equal(created.first.valuationQty, 12, '核算数量必须优先使用本批实测重量')
  assert.equal(created.first.totalAmount, 48, '按重量计价必须正确计算总金额')

  const listed = await listMaterialIns({ statuses: ['PENDING'], keyword: `验证 铝材`, page: 1, pageSize: 20 })
  assert.equal(listed.items.some((item) => item.id === created.first.id), true, '多个关键词必须同时命中关联物料字段')
  const archived = await archiveMaterialIn(created.first.id)
  assert.equal(archived.updated.deletedAt instanceof Date, true, '归档必须由领域服务写入删除时间')
  const afterArchive = await listMaterialIns({ statuses: [], keyword: created.first.inboundNo, page: 1, pageSize: 20 })
  assert.equal(afterArchive.items.length, 0, '归档记录不得继续出现在来料列表')
  await assert.rejects(
    () => createMaterialIns(createMaterialInSchema.parse({ ...input, supplierId: 'missing-supplier' })),
    MaterialInDomainError,
    '不存在的供应商必须由领域服务拒绝',
  )
}

async function main() {
  verifySchemaAndBoundaries()
  if (process.env.VERIFY_DATABASE_INTEGRATION === '1') await verifyDatabaseRules()
  console.log(`来料领域校验通过：请求契约、公共异步选择器、薄页面和薄 API${process.env.VERIFY_DATABASE_INTEGRATION === '1' ? '及临时数据库集成' : ''}符合模块化约束。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
