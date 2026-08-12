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
  const [{ prisma }, { ensureDefaultPermissions, getEffectivePermissionMap, hasResourcePermission }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/permissions'),
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

    console.log('权限验证通过：角色兜底、权限组赋权与移除恢复均在临时完整数据库中符合预期。')
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
