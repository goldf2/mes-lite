import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import {
  materialInputSchema,
  materialQueryNeedsBomPermission,
  materialUpdateInputSchema,
  parseMaterialListQuery,
} from '@/modules/materials/contracts/material-schema'
import {
  createMaterial,
  MaterialConflictError,
  MaterialInputError,
  updateMaterial,
} from '@/modules/materials/server/material-command-service'
import { listMaterials } from '@/modules/materials/server/material-query-service'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function verifySchemas() {
  const parsed = parseMaterialListQuery(new URLSearchParams({ page: '-1', pageSize: '999', sortBy: 'unknown' }))
  assert.equal(parsed.data?.page, 1, '非法页码必须回退到第一页')
  assert.equal(parsed.data?.pageSize, 200, '分页大小必须限制在 200')
  assert.equal(parsed.data?.sortBy, 'createdAt', '非法排序字段必须回退')
  assert.equal(parseMaterialListQuery(new URLSearchParams({ advanced: '{' })).error, '高级搜索条件格式错误', '损坏的高级搜索 JSON 必须拒绝')
  const bomQuery = parseMaterialListQuery(new URLSearchParams({ sortBy: 'bomSummary' })).data!
  assert.equal(materialQueryNeedsBomPermission(bomQuery), true, 'BOM 简况查询必须触发附加权限检查')
  assert.equal(materialInputSchema.safeParse({ code: '', name: '测试', unit: '件' }).success, false, '物料编码不能为空')
  assert.equal(materialUpdateInputSchema.safeParse({ code: 'X', name: '测试', unit: '件' }).success, false, '更新物料必须提供 ID')
}

function verifyBoundaries() {
  const route = read('app/api/materials/route.ts')
  const query = read('modules/materials/server/material-query-service.ts')
  const command = read('modules/materials/server/material-command-service.ts')
  const client = read('modules/materials/client/materials-api.ts')
  const page = read('modules/materials/ui/MaterialPage.tsx')
  assert.match(route, /material-query-service/, '物料 API 必须委托查询领域服务')
  assert.match(route, /material-command-service/, '物料 API 必须委托写入领域服务')
  assert.match(route, /requireResourcePermission[\s\S]*writeAuditLog/, '物料 API 必须保留权限与请求审计')
  assert.doesNotMatch(route, /@\/lib\/prisma|prisma\.|\$transaction|normalizeConversionRate|getUnitCatalog/, '物料 API 不得保留数据库或单位业务规则')
  assert.ok(route.split('\n').length <= 90, '物料 API 必须保持不超过 90 行的薄适配层')
  assert.match(command, /\$transaction[\s\S]*stock\.create/, '新建物料与库存记录必须处于同一事务')
  assert.match(command, /UNIT_CHANGE[\s\S]*numericValuesConverted: false/, '单位变更必须保留明确的非换算审计语义')
  assert.match(command, /unitVersion: unitsChanged \? \{ increment: 1 \}/, '单位变更必须递增单位版本')
  assert.doesNotMatch(command, /NextRequest|NextResponse|requireResourcePermission/, '物料写入服务不得依赖 HTTP')
  assert.match(query, /tokenizeKeywordQuery/, '物料查询服务必须保留智能多关键词搜索')
  assert.match(query, /listByBomSummary[\s\S]*withMaterialImageUrls/, '物料查询服务必须集中 BOM 简况与主图装配')
  assert.match(client, /listMaterials\(params: URLSearchParams, signal\?: AbortSignal\)/, '物料列表 client 必须支持取消过期搜索请求')
  assert.match(page, /materialRequestRef\.current\?\.abort\(\)[\s\S]*listMaterials\(buildMaterialParams\(\), controller\.signal\)/, '物料页面必须取消上一轮搜索并只保留最新请求')
  assert.match(page, /if \(controller\.signal\.aborted\) return[\s\S]*setMaterials\(\[\]\)/, '搜索失败必须区分过期请求并清除误导性的旧结果')
  assert.match(page, /materialLoading \? \([\s\S]*正在筛选物料[\s\S]*没有匹配的物料[\s\S]*清除搜索条件/, '搜索期间和无结果时必须呈现明确状态，不能继续显示旧卡片')
}

async function verifyDatabaseRules() {
  const suffix = randomUUID().slice(0, 8)
  const input = materialInputSchema.parse({
    code: `VERIFY-MAT-${suffix}`,
    name: '验证 铝件',
    unit: '件',
    stockUnit: '件',
    valuationUnit: '件',
    primaryMeasure: 'QUANTITY',
  })
  const material = await createMaterial(input)
  const stock = await prisma.stock.findUnique({ where: { materialId: material.id } })
  assert.ok(stock, '创建物料必须在同一事务内建立库存记录')
  await assert.rejects(() => createMaterial(input), MaterialConflictError, '重复编码必须由领域服务拒绝')

  const query = parseMaterialListQuery(new URLSearchParams({ keyword: '验证 铝', pageSize: '20' })).data!
  const listed = await listMaterials(query)
  assert.equal(listed.data.some((item) => item.id === material.id), true, '空格分隔关键词必须同时匹配物料字段')

  const sameUnitUpdate = materialUpdateInputSchema.parse({ ...input, id: material.id, name: '验证铝件（更新）' })
  const auditContext = async () => ({ operatorId: undefined, operatorName: '自动验证', ipAddress: undefined, userAgent: undefined })
  const sameUnitResult = await updateMaterial(sameUnitUpdate, auditContext)
  assert.equal(sameUnitResult.unitsChanged, false, '普通资料更新不得误判为单位变更')

  const unitUpdate = materialUpdateInputSchema.parse({
    ...sameUnitUpdate,
    primaryMeasure: 'WEIGHT',
    unit: 'kg',
    stockUnit: 'kg',
    valuationUnit: 'kg',
  })
  const unitResult = await updateMaterial(unitUpdate, auditContext)
  assert.equal(unitResult.unitsChanged, true, '计量方式与库存单位变化必须进入单位变更流程')
  assert.equal(unitResult.material.unitVersion, 2, '单位变更必须递增单位版本')
  const audit = await prisma.auditLog.findFirst({ where: { entityType: 'MATERIAL', entityId: material.id, action: 'UNIT_CHANGE' } })
  assert.ok(audit, '单位变更与物料更新必须在同一事务写入审计')

  const invalidUnit = materialUpdateInputSchema.parse({ ...unitUpdate, stockUnit: 'mm' })
  await assert.rejects(() => updateMaterial(invalidUnit, auditContext), MaterialInputError, '不属于计量方式的单位必须拒绝')
}

async function main() {
  verifySchemas()
  verifyBoundaries()
  if (process.env.VERIFY_DATABASE_INTEGRATION === '1') await verifyDatabaseRules()
  console.log(`物料服务校验通过：请求契约、薄 API、查询与写入边界${process.env.VERIFY_DATABASE_INTEGRATION === '1' ? '及临时数据库集成' : ''}符合模块化约束。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
