import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { assertInventoryIssueAvailability } from './inventory'

export const flowTransferInputSchema = z.object({
  transferDate: z.string().min(1, '转移日期必填'),
  materialId: z.string().min(1, '请选择物料'),
  sourceLocationId: z.string().min(1, '请选择来源库位'),
  targetLocationId: z.string().min(1, '请选择目标库位'),
  quantity: z.number().finite().positive('转移数量必须大于 0'),
  employeeId: z.string().min(1, '请选择操作员工'),
  note: z.string().trim().max(500, '备注不能超过 500 个字').optional(),
}).refine((value) => value.sourceLocationId !== value.targetLocationId, {
  message: '来源库位和目标库位不能相同',
  path: ['targetLocationId'],
})

export function parseFlowTransferDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('转移日期格式不正确')
  return date
}

export const flowTransferInclude = {
  material: {
    select: {
      id: true,
      code: true,
      name: true,
      spec: true,
      category: true,
      stockUnit: true,
      unit: true,
    },
  },
  sourceLocation: { select: { id: true, code: true, name: true } },
  targetLocation: { select: { id: true, code: true, name: true } },
  employee: { select: { id: true, code: true, name: true, department: true, isActive: true } },
} as const

export async function resolveFlowTransferDraft(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof flowTransferInputSchema>,
) {
  const [material, sourceLocation, targetLocation, employee] = await Promise.all([
    tx.material.findFirst({
      where: { id: input.materialId, deletedAt: null },
      select: { id: true, code: true, name: true, stockUnit: true, unit: true },
    }),
    tx.inventoryLocation.findFirst({
      where: { id: input.sourceLocationId, isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tx.inventoryLocation.findFirst({
      where: { id: input.targetLocationId, isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tx.employee.findFirst({
      where: { id: input.employeeId, isActive: true },
      select: { id: true, code: true, name: true, department: true },
    }),
  ])
  if (!material) throw new Error('物料不存在或已归档')
  if (!sourceLocation) throw new Error('来源库位不存在、已停用或已归档')
  if (!targetLocation) throw new Error('目标库位不存在、已停用或已归档')
  if (!employee) throw new Error('操作员工不存在或已停用，请重新选择')
  if (sourceLocation.id === targetLocation.id) throw new Error('来源库位和目标库位不能相同')
  await assertInventoryIssueAvailability(tx, {
    materialId: material.id,
    stockQty: input.quantity,
    locationId: sourceLocation.id,
  })
  return { material, sourceLocation, targetLocation, employee }
}
