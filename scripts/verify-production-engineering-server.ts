import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import {
  processRouteInputSchema,
  processTemplateInputSchema,
} from '@/modules/production/contracts/production-engineering-schema'
import {
  createProcessRoute,
  createProcessTemplate,
  updateProcessRoute,
  updateProcessTemplate,
} from '@/modules/production/server/production-engineering-service'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function verifySchemas() {
  const template = processTemplateInputSchema.parse({
    code: 'PROC-VERIFY',
    name: '验证工艺',
    category: 'OTHER',
  })
  assert.equal(template.standardBatchQty, 1000, '工艺模板必须集中应用标准批量默认值')
  assert.equal(template.yieldRate, 1, '工艺模板必须集中应用良率默认值')
  assert.equal(processTemplateInputSchema.safeParse({ ...template, yieldRate: 1.01 }).success, false, '工艺良率不得超过 1')

  assert.equal(processRouteInputSchema.safeParse({ productId: 'material:x', name: '空路线', steps: [] }).success, false, '工艺路线至少需要一个工序')
  const route = processRouteInputSchema.parse({
    productId: 'material:x',
    name: '验证路线',
    steps: [{ stepNo: 1, name: '验证工序' }],
  })
  assert.equal(route.steps[0].standardBatchQty, 1000, '路线工序必须复用集中默认值')
  assert.equal(route.steps[0].peopleCount, 1, '路线工序必须集中应用人数默认值')
}

function verifyBoundaries() {
  const routes = [
    'app/api/process-templates/route.ts',
    'app/api/process-routes/route.ts',
  ]
  for (const path of routes) {
    const source = read(path)
    assert.match(source, /production-engineering-service/, `${path} 必须委托生产领域服务`)
    assert.match(source, /requireResourcePermission/, `${path} 必须保留 HTTP 权限边界`)
    assert.match(source, /writeAuditLog/, `${path} 必须保留请求审计`)
    assert.doesNotMatch(source, /@\/lib\/prisma|prisma\.|\$transaction|resolveProductId|nextConfigurationSortOrder/, `${path} 不得保留数据库事务或领域规则`)
    assert.ok(source.split('\n').length <= 70, `${path} 超过 70 行，应保持薄 HTTP 适配层`)
  }

  const service = read('modules/production/server/production-engineering-service.ts')
  const schema = read('modules/production/contracts/production-engineering-schema.ts')
  assert.match(service, /\$transaction/, '生产工程服务必须拥有事务边界')
  assert.match(service, /nextConfigurationSortOrder/, '生产工程服务必须拥有业务排序规则')
  assert.match(service, /resolveProductId/, '生产工程服务必须拥有物料兼容映射')
  assert.match(service, /isDefault: true[\s\S]*isDefault: false/, '生产工程服务必须维护单一默认路线')
  assert.match(service, /processStep\.updateMany[\s\S]*deletedAt: new Date/, '更新路线必须软删除旧工序')
  assert.doesNotMatch(service, /NextRequest|NextResponse|writeAuditLog/, '生产工程服务不得依赖 HTTP 请求对象')
  assert.match(schema, /yieldRate:[\s\S]*max\(1\)/, '生产工程 Schema 必须限制良率上界')
  assert.match(schema, /steps:[\s\S]*min\(1, '至少需要一个工序'\)/, '生产工程 Schema 必须限制空路线')
}

async function verifyDatabaseRules() {
  const suffix = randomUUID().slice(0, 8)
  const material = await prisma.material.create({
    data: { code: `VERIFY-ENG-${suffix}`, name: '生产工程验证物料', unit: '件' },
  })
  const templateInput = processTemplateInputSchema.parse({
    code: `PROC-${suffix}`,
    name: '验证工艺模板',
    category: 'OTHER',
    materialIds: [material.id],
  })
  const template = await createProcessTemplate(templateInput)
  assert.equal(template.materials[0]?.id, material.id, '创建工艺模板必须原子关联物料')
  const updatedTemplate = await updateProcessTemplate(template.id, { ...templateInput, name: '已更新工艺模板' })
  assert.equal(updatedTemplate.before.name, '验证工艺模板', '模板更新必须返回审计前快照')
  assert.equal(updatedTemplate.template.name, '已更新工艺模板', '模板更新必须由领域服务完成')

  const first = await createProcessRoute(processRouteInputSchema.parse({
    productId: `material:${material.id}`,
    name: '第一默认路线',
    isDefault: true,
    steps: [{ stepNo: 1, name: '旧工序' }],
  }))
  const second = await createProcessRoute(processRouteInputSchema.parse({
    productId: `material:${material.id}`,
    name: '第二默认路线',
    isDefault: true,
    steps: [{ stepNo: 1, name: '待替换工序' }],
  }))
  const demoted = await prisma.processRoute.findUniqueOrThrow({ where: { id: first.route.id } })
  assert.equal(demoted.isDefault, false, '创建新默认路线必须撤销同物料旧默认路线')
  assert.equal(second.route.isDefault, true, '新路线必须成为默认路线')

  const updatedRoute = await updateProcessRoute(second.route.id, processRouteInputSchema.parse({
    productId: `material:${material.id}`,
    name: '第二默认路线',
    isDefault: true,
    steps: [{ stepNo: 10, name: '新工序' }],
  }))
  assert.equal(updatedRoute.before.steps[0]?.name, '待替换工序', '路线更新必须返回包含旧工序的审计前快照')
  assert.equal(updatedRoute.route.steps[0]?.name, '新工序', '路线更新必须只返回当前有效工序')
  const allSteps = await prisma.processStep.findMany({ where: { routeId: second.route.id }, orderBy: { stepNo: 'asc' } })
  assert.equal(allSteps.filter((step) => step.deletedAt === null).length, 1, '路线更新后只能保留一组有效工序')
  assert.equal(allSteps.filter((step) => step.deletedAt !== null).length, 1, '被替换工序必须软删除并保留追溯记录')
}

async function main() {
  verifySchemas()
  verifyBoundaries()
  if (process.env.VERIFY_DATABASE_INTEGRATION === '1') await verifyDatabaseRules()
  console.log(`生产工程服务校验通过：Schema、薄 API、事务规则${process.env.VERIFY_DATABASE_INTEGRATION === '1' ? '及临时数据库集成' : ''}符合领域边界。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
