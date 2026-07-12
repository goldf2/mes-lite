import { PrismaClient } from '@prisma/client'
import { ensureDefaultPermissions, getEffectivePermissionMap, hasResourcePermission } from '../lib/permissions'

const prisma = new PrismaClient()

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

async function main() {
  const marker = `PERM-${Date.now()}`
  let operatorId: string | null = null

  try {
    await ensureDefaultPermissions()

    const operator = await prisma.operator.create({
      data: {
        username: marker,
        passwordHash: 'permission-test',
        name: '权限验证用户',
        role: 'OPERATOR',
        status: 'ACTIVE',
      },
    })
    operatorId = operator.id

    const basePermissions = await getEffectivePermissionMap(operator)
    assertEqual(basePermissions.system.canRead, false, '录入角色默认无系统管理查看权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), false, '录入角色默认无法查看系统管理')

    const adminGroup = await prisma.permissionGroup.findUniqueOrThrow({
      where: { code: 'system_admin' },
    })

    await prisma.operatorPermissionGroup.create({
      data: {
        operatorId: operator.id,
        groupId: adminGroup.id,
      },
    })

    const grantedPermissions = await getEffectivePermissionMap(operator)
    assertEqual(grantedPermissions.system.canRead, true, '加入权限组后拥有系统管理查看权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), true, '加入权限组后权限判断通过')

    await prisma.operatorPermissionGroup.deleteMany({ where: { operatorId: operator.id } })

    const restoredPermissions = await getEffectivePermissionMap(operator)
    assertEqual(restoredPermissions.system.canRead, false, '移除权限组后恢复角色默认权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), false, '移除权限组后权限判断恢复默认')

    console.log('权限验证通过：角色兜底权限、权限组赋权、移除权限组恢复兜底均符合预期。')
  } finally {
    if (operatorId) {
      await prisma.operatorSession.deleteMany({ where: { operatorId } })
      await prisma.operatorPermissionOverride.deleteMany({ where: { operatorId } })
      await prisma.operatorPermissionGroup.deleteMany({ where: { operatorId } })
      await prisma.operator.deleteMany({ where: { id: operatorId } })
    }
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
