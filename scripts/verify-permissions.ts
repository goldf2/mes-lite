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

    await prisma.operatorPermissionOverride.create({
      data: {
        operatorId: operator.id,
        resource: 'system',
        canRead: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      },
    })

    const grantedPermissions = await getEffectivePermissionMap(operator)
    assertEqual(grantedPermissions.system.canRead, true, '用户覆盖后拥有系统管理查看权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), true, '用户覆盖后权限判断通过')

    await prisma.operatorPermissionOverride.deleteMany({ where: { operatorId: operator.id } })

    const restoredPermissions = await getEffectivePermissionMap(operator)
    assertEqual(restoredPermissions.system.canRead, false, '删除用户覆盖后恢复角色默认权限')
    assertEqual(await hasResourcePermission(operator, 'system', 'read'), false, '删除用户覆盖后权限判断恢复默认')

    console.log('权限验证通过：角色默认权限、用户覆盖赋权、覆盖清除恢复默认均符合预期。')
  } finally {
    if (operatorId) {
      await prisma.operatorSession.deleteMany({ where: { operatorId } })
      await prisma.operatorPermissionOverride.deleteMany({ where: { operatorId } })
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
