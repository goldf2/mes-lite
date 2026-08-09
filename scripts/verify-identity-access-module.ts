import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasAnyGrant, normalizePermissionGroupCode } from '../modules/identity-access/domain/permission-admin'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const route = read('app/api/permissions/route.ts')
const contracts = read('modules/identity-access/contracts/permission-admin.ts')
const service = read('modules/identity-access/server/permission-admin-service.ts')
const requiredFiles = [
  'modules/identity-access/index.ts',
  'modules/identity-access/domain/permission-admin.ts',
  'modules/identity-access/contracts/permission-admin.ts',
  'modules/identity-access/server/permission-admin-service.ts',
]

for (const path of requiredFiles) {
  assert.ok(existsSync(join(root, path)), `身份权限领域缺少公共模块：${path}`)
}
assert.ok(route.split('\n').length <= 100, '权限 API 必须保持为不超过 100 行的 HTTP 适配层')
assert.doesNotMatch(route, /prisma\.|permissionGroup\.find|\$transaction/, '权限 API 不得直接执行查询或事务')
assert.match(route, /listPermissionAdministration\(/, '权限 API 必须通过查询服务读取权限管理数据')
assert.match(route, /updatePermissionAdministration\(/, '权限 API 必须通过命令服务保存权限')
assert.match(route, /createPermissionGroup\(/, '权限 API 必须通过命令服务创建权限组')
assert.match(route, /writeAuditLog\(/, '权限 API 必须保留请求级审计')
assert.match(contracts, /updatePermissionsSchema/, '权限输入契约必须由领域模块统一维护')
assert.match(service, /ensureDefaultPermissions\(/, '权限服务必须在读写前建立默认权限基线')
assert.match(service, /hasResourcePermission\(/, '权限服务必须执行资源级授权检查')
assert.match(service, /prisma\.\$transaction\(/, '权限变更必须在事务内完成')

assert.equal(normalizePermissionGroupCode(' 生产 审核/组 '), '生产_审核_组')
assert.equal(normalizePermissionGroupCode('___'), '')
assert.equal(hasAnyGrant({ materials: {
  canRead: true, canCreate: false, canUpdate: false, canDelete: false, canGrant: false,
} }), false)
assert.equal(hasAnyGrant({ materials: {
  canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: true,
} }), true)

console.log(`身份权限模块验证通过：权限 API ${route.split('\n').length} 行，输入契约、授权规则、事务服务与请求级审计边界完整。`)
