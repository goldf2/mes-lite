import { canManage } from '@/lib/auth'
import { hasResourcePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { applyStatusFilter } from '@/lib/status-filter'
import type { PermissionActor } from '../contracts/permission-admin'
import type { UpdateOperatorInput } from '../contracts/operator-admin'

export class OperatorAdminError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 = 400) {
    super(message)
    this.name = 'OperatorAdminError'
  }
}

const operatorSelect = {
  id: true,
  username: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  approvedAt: true,
  approvedBy: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const

export function listOperators(statuses: string[]) {
  const where: Record<string, unknown> = {}
  applyStatusFilter(where, statuses)
  return prisma.operator.findMany({
    where,
    select: operatorSelect,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function updateOperatorAdministration(actor: PermissionActor, input: UpdateOperatorInput) {
  if (!(await hasResourcePermission(actor, 'operators', 'update'))) {
    throw new OperatorAdminError('无权限', 403)
  }
  if (input.role && !canManage(actor.role)) {
    throw new OperatorAdminError('只有管理员可以调整角色', 403)
  }
  if (input.id === actor.id && input.status && input.status !== 'ACTIVE') {
    throw new OperatorAdminError('不能停用或拒绝当前登录账号')
  }

  const updateData: Record<string, unknown> = {}
  if (input.role) updateData.role = input.role
  if (input.status) {
    updateData.status = input.status
    if (input.status === 'ACTIVE') {
      updateData.approvedAt = new Date()
      updateData.approvedBy = actor.id
    }
    if (input.status === 'REJECTED' || input.status === 'DISABLED') {
      await prisma.operatorSession.deleteMany({ where: { operatorId: input.id } })
    }
  }

  try {
    return await prisma.operator.update({ where: { id: input.id }, data: updateData, select: operatorSelect })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
      throw new OperatorAdminError('操作人员不存在', 404)
    }
    throw error
  }
}
