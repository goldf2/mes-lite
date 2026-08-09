import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-party-reference-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/configuration/contracts/party-schema.ts',
    'modules/configuration/domain/party-errors.ts',
    'modules/configuration/domain/party-kind.ts',
    'modules/configuration/server/party-service.ts',
    'modules/configuration/http/party-route-handlers.ts',
  ]
  for (const path of requiredFiles) {
    assert.ok(existsSync(join(root, path)), `业务配置缺少往来单位模块文件：${path}`)
  }

  for (const routePath of ['app/api/suppliers/route.ts', 'app/api/customers/route.ts']) {
    const route = read(routePath)
    assert.ok(route.split('\n').length <= 10, `${routePath} 应保持为不超过 10 行的资源声明`)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `${routePath} 不得直接访问 Prisma`)
    assert.match(route, /createPartyRouteHandlers/, `${routePath} 必须复用配置领域 HTTP 适配器`)
  }

  const service = read('modules/configuration/server/party-service.ts')
  assert.doesNotMatch(service, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '往来单位服务不得依赖 HTTP、权限或请求审计')
  const handler = read('modules/configuration/http/party-route-handlers.ts')
  assert.doesNotMatch(handler, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, 'HTTP 适配器不得直接访问 Prisma')
  assert.match(handler, /action: 'CREATE'[\s\S]*action: 'UPDATE'[\s\S]*action: 'ARCHIVE'/, '供应商与客户的新增、更新和归档必须统一写审计')
}

async function main() {
  const [
    { prisma },
    { partyInputSchema },
    { PartyDomainError },
    { createManagedParty, updateManagedParty, archiveManagedParty, listManagedParties },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/configuration/contracts/party-schema'),
    import('../modules/configuration/domain/party-errors'),
    import('../modules/configuration/server/party-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.equal(partyInputSchema.safeParse({ name: '  ' }).success, false, '名称不能只包含空白')

    const supplier = await createManagedParty('supplier', {
      name: ' 华东紧固件 ', contact: ' 张工 ', phone: ' 13800000000 ', address: ' 苏州 ',
    })
    assert.match(supplier.code, /^SUP-[A-Z0-9]+-[A-F0-9]{8}$/)
    assert.deepEqual(
      [supplier.name, supplier.contact, supplier.phone, supplier.address, supplier.sortOrder],
      ['华东紧固件', '张工', '13800000000', '苏州', 0],
      '服务必须统一清理往来单位输入并把首条资料追加到末尾',
    )
    const duplicateSupplier = await createManagedParty('supplier', { name: '华东紧固件' })
    assert.equal(duplicateSupplier.sortOrder, 1, '供应商沿用允许同名、编码唯一的既有业务规则')

    const customer = await createManagedParty('customer', {
      name: ' 创新模具 ', contact: ' 李经理 ', phone: '', address: ' 宁波 ',
    })
    assert.match(customer.code, /^cus_/)
    await assert.rejects(
      () => createManagedParty('customer', { name: '创新模具' }),
      (error: unknown) => error instanceof PartyDomainError && error.message === '客户名称已存在',
      '客户必须沿用有效名称唯一规则',
    )

    const supplierSearch = await listManagedParties('supplier', '华东 张工')
    assert.deepEqual(supplierSearch.map((item) => item.id), [supplier.id], '多关键词必须可跨名称和联系人共同筛选')
    const customerSearch = await listManagedParties('customer', '创新 宁波')
    assert.deepEqual(customerSearch.map((item) => item.id), [customer.id])

    const { current, updated } = await updateManagedParty('customer', customer.id, {
      name: '创新模具二厂', contact: ' 王经理 ', phone: ' ', address: ' 杭州 ',
    })
    assert.equal(current.name, '创新模具')
    assert.deepEqual([updated.name, updated.contact, updated.phone, updated.address], ['创新模具二厂', '王经理', null, '杭州'])

    const archivedAt = new Date('2026-08-10T08:00:00.000Z')
    const { archived } = await archiveManagedParty('supplier', supplier.id, archivedAt)
    assert.equal(archived.deletedAt?.toISOString(), archivedAt.toISOString())
    assert.equal((await listManagedParties('supplier', '华东 张工')).length, 0, '归档资料不得继续出现在有效资料列表')
    await assert.rejects(
      () => updateManagedParty('supplier', supplier.id, { name: '不可更新' }),
      (error: unknown) => error instanceof PartyDomainError && error.status === 404,
      '归档资料不得继续编辑',
    )

    console.log('业务配置往来单位验证通过：公共搜索、输入清理、差异化名称规则、排序、更新和归档均符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
