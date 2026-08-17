import { canManage, hashPassword } from '@/lib/auth'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { hasResourcePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { applyStatusFilter } from '@/lib/status-filter'
import type { PermissionActor } from '../contracts/permission-admin'
import type { ResetOperatorPasswordInput, UpdateOperatorInput } from '../contracts/operator-admin'

export class OperatorAdminError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 = 400) {
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

export async function updateOperatorAdministration(
  actor: PermissionActor,
  input: UpdateOperatorInput,
  auditContext?: AuditContext,
) {
  if (!(await hasResourcePermission(actor, 'operators', 'update'))) {
    throw new OperatorAdminError('无权限', 403)
  }
  if ((input.username !== undefined || input.name !== undefined || input.phone !== undefined) && !canManage(actor.role)) {
    throw new OperatorAdminError('只有管理员可以修改账号资料', 403)
  }
  if (input.role && !canManage(actor.role)) {
    throw new OperatorAdminError('只有管理员可以调整角色', 403)
  }
  if (input.id === actor.id && input.status && input.status !== 'ACTIVE') {
    throw new OperatorAdminError('不能停用或拒绝当前登录账号')
  }

  const updateData: Record<string, unknown> = {}
  if (input.username !== undefined) updateData.username = input.username
  if (input.name !== undefined) updateData.name = input.name
  if (input.phone !== undefined) updateData.phone = input.phone || null
  if (input.role) updateData.role = input.role
  if (input.status) {
    updateData.status = input.status
    if (input.status === 'ACTIVE') {
      updateData.approvedAt = new Date()
      updateData.approvedBy = actor.id
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.operator.findUnique({ where: { id: input.id }, select: operatorSelect })
      if (!before) throw new OperatorAdminError('操作人员不存在', 404)
      if (input.status === 'REJECTED' || input.status === 'DISABLED') {
        await tx.operatorSession.deleteMany({ where: { operatorId: input.id } })
      }
      const updated = await tx.operator.update({ where: { id: input.id }, data: updateData, select: operatorSelect })
      if (auditContext) await createAuditLog(tx, auditContext, {
        action: 'UPDATE',
        entityType: 'OPERATOR',
        entityId: updated.id,
        entityLabel: updated.username,
        beforeData: before,
        afterData: updated,
        note: [
          input.username !== undefined || input.name !== undefined || input.phone !== undefined ? '账号资料已调整' : null,
          input.role ? '操作员角色已调整' : null,
          input.status ? `账号状态调整为 ${input.status}` : null,
        ].filter(Boolean).join('；'),
      })
      return updated
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error) {
      if (error.code === 'P2025') throw new OperatorAdminError('操作人员不存在', 404)
      if (error.code === 'P2002') throw new OperatorAdminError('登录账号已存在', 409)
    }
    throw error
  }
}

export async function deleteOperatorAdministration(
  actor: PermissionActor,
  operatorId: string,
  auditContext?: AuditContext,
) {
  if (!(await hasResourcePermission(actor, 'operators', 'delete'))) {
    throw new OperatorAdminError('无权限', 403)
  }
  if (operatorId === actor.id) {
    throw new OperatorAdminError('不能删除当前登录账号', 409)
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.operator.findUnique({ where: { id: operatorId }, select: operatorSelect })
      if (!before) throw new OperatorAdminError('操作人员不存在', 404)
      if (before.status === 'ACTIVE') {
        throw new OperatorAdminError('启用账号不能删除，请先停用后再试', 409)
      }

      const [
        employeeCount,
        actorAuditCount,
        equipmentEventCount,
        inspectionCount,
        maintenanceCount,
        approvedOperatorCount,
        grantedPermissionCount,
        functionUsageCount,
        workspacePreferenceCount,
      ] = await Promise.all([
        tx.employee.count({ where: { operatorId } }),
        tx.auditLog.count({ where: { operatorId } }),
        tx.equipmentEvent.count({ where: { operatorId } }),
        tx.equipmentInspectionRecord.count({ where: { inspectorId: operatorId } }),
        tx.equipmentMaintenanceWorkOrder.count({
          where: {
            OR: [
              { createdById: operatorId },
              { startedById: operatorId },
              { completedById: operatorId },
              { cancelledById: operatorId },
            ],
          },
        }),
        tx.operator.count({ where: { id: { not: operatorId }, approvedBy: operatorId } }),
        tx.operatorPermissionOverride.count({ where: { operatorId: { not: operatorId }, grantedBy: operatorId } }),
        tx.operatorFunctionUsage.count({ where: { operatorId } }),
        tx.operatorWorkspacePreference.count({ where: { operatorId } }),
      ])

      const blockers = [
        employeeCount > 0 ? '员工档案' : null,
        before.lastLoginAt || actorAuditCount > 0 ? '登录、操作或审计记录' : null,
        equipmentEventCount > 0 ? '设备运行事件' : null,
        inspectionCount > 0 ? '设备点检记录' : null,
        maintenanceCount > 0 ? '设备维修记录' : null,
        approvedOperatorCount > 0 ? '账号审批记录' : null,
        grantedPermissionCount > 0 ? '权限授权记录' : null,
        functionUsageCount > 0 || workspacePreferenceCount > 0 ? '工作区使用记录' : null,
      ].filter((item): item is string => Boolean(item))
      if (blockers.length > 0) {
        throw new OperatorAdminError(`该人员存在关联，不能删除：${blockers.join('、')}`, 409)
      }

      await tx.operator.delete({ where: { id: operatorId } })
      if (auditContext) await createAuditLog(tx, auditContext, {
        action: 'DELETE',
        entityType: 'OPERATOR',
        entityId: before.id,
        entityLabel: before.username,
        beforeData: before,
        note: '删除无关联人员账号',
      })
      return before
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error) {
      if (error.code === 'P2025') throw new OperatorAdminError('操作人员不存在', 404)
      if (error.code === 'P2003') throw new OperatorAdminError('该人员仍存在关联数据，不能删除', 409)
    }
    throw error
  }
}

export async function resetOperatorPasswordAdministration(
  actor: PermissionActor,
  input: ResetOperatorPasswordInput,
  auditContext?: AuditContext,
) {
  if (!(await hasResourcePermission(actor, 'operators', 'update')) || !canManage(actor.role)) {
    throw new OperatorAdminError('只有管理员可以重置密码', 403)
  }
  const passwordHash = hashPassword(input.password)

  return prisma.$transaction(async (tx) => {
    const before = await tx.operator.findUnique({ where: { id: input.id }, select: operatorSelect })
    if (!before) throw new OperatorAdminError('操作人员不存在', 404)
    const activeSessionCount = await tx.operatorSession.count({ where: { operatorId: input.id } })
    await tx.operatorSession.deleteMany({ where: { operatorId: input.id } })
    const updated = await tx.operator.update({
      where: { id: input.id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      },
      select: operatorSelect,
    })
    if (auditContext) await createAuditLog(tx, auditContext, {
      action: 'PASSWORD_RESET',
      entityType: 'OPERATOR',
      entityId: updated.id,
      entityLabel: updated.username,
      beforeData: { username: before.username, status: before.status, activeSessionCount },
      afterData: { username: updated.username, status: updated.status, activeSessionCount: 0, loginLockCleared: true },
      note: '管理员重置人员密码并撤销全部会话',
    })
    return updated
  })
}
