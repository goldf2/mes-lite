import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-permissions-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { ensureDefaultPermissions, getEffectivePermissionMap, hasResourcePermission },
    { updatePermissionAdministration },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/permissions'),
    import('../modules/identity-access/server/permission-admin-service'),
  ])
  try {
    await ensureDefaultPermissions()

    const operator = await prisma.operator.create({
      data: {
        username: `PERM-${Date.now()}`,
        passwordHash: 'permission-test',
        name: '权限验证用户',
        role: 'OPERATOR',
        status: 'ACTIVE',
      },
    })

    const basePermissions = await getEffectivePermissionMap(operator)
    assertEqual(basePermissions.aiAssistant.canRead, true, '录入角色默认可以使用只读 AI 助手')
    assertEqual(basePermissions.system.canRead, false, '录入角色默认无系统管理查看权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), false, '录入角色默认无法查看系统管理')

    const adminGroup = await prisma.permissionGroup.findUniqueOrThrow({ where: { code: 'system_admin' } })
    await prisma.operatorPermissionGroup.create({
      data: { operatorId: operator.id, groupId: adminGroup.id },
    })

    const grantedPermissions = await getEffectivePermissionMap(operator)
    assertEqual(grantedPermissions.system.canRead, true, '加入权限组后拥有系统管理查看权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), true, '加入权限组后权限判断通过')

    await prisma.operatorPermissionGroup.deleteMany({ where: { operatorId: operator.id } })

    const restoredPermissions = await getEffectivePermissionMap(operator)
    assertEqual(restoredPermissions.system.canRead, false, '移除权限组后恢复角色默认权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), false, '移除权限组后权限判断恢复默认')

    const admin = await prisma.operator.create({ data: {
      username: `PERM-ADMIN-${Date.now()}`, passwordHash: 'permission-test', name: '临时授权管理员',
      role: 'ADMIN', status: 'ACTIVE',
    } })
    const startsAt = new Date(Date.now() - 60_000).toISOString()
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    await assert.rejects(
      () => updatePermissionAdministration(admin, { operatorPermissionOverrides: [{
        action: 'UPSERT', operatorId: operator.id, resource: 'dataTools',
        canRead: true, startsAt, expiresAt, reason: '',
      }] }),
      /必须填写原因/,
      '个人临时授权必须记录原因',
    )
    const temporaryGrant = await updatePermissionAdministration(admin, { operatorPermissionOverrides: [{
      action: 'UPSERT', operatorId: operator.id, resource: 'dataTools',
      canRead: true, canUpdate: true, startsAt, expiresAt, reason: '临时执行灾备验证',
    }] })
    assertEqual(Boolean(temporaryGrant.overrideAudit), true, '个人临时授权变更必须返回审计快照')
    const savedGrant = await prisma.operatorPermissionOverride.findUniqueOrThrow({
      where: { operatorId_resource: { operatorId: operator.id, resource: 'dataTools' } },
    })
    assertEqual(savedGrant.reason, '临时执行灾备验证', '临时授权必须保存原因')
    assertEqual(savedGrant.grantedBy, admin.id, '临时授权必须保存授权人')
    assertEqual(await hasResourcePermission(operator, 'dataTools', 'update'), true, '生效时间内的个人临时授权必须可用')
    await prisma.operatorPermissionOverride.update({
      where: { id: savedGrant.id }, data: { startsAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) },
    })
    assertEqual(await hasResourcePermission(operator, 'dataTools', 'update'), false, '过期个人临时授权必须自动失效')
    await prisma.operatorPermissionOverride.update({
      where: { id: savedGrant.id }, data: { legacyPermanent: true },
    })
    assertEqual(await hasResourcePermission(operator, 'dataTools', 'update'), true, '迁移标记的历史永久覆盖在重新审批前保持兼容')

    console.log('权限验证通过：角色兜底、权限组、限时个人授权、过期失效与历史兼容均符合预期。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
