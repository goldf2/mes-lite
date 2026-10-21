import type { Prisma } from '@prisma/client'

export const warehousePackingLotInclude = {
  material: { select: { id: true, code: true, name: true, spec: true, stockUnit: true, customerId: true, deletedAt: true } },
  productionOutput: { include: { actual: { select: { id: true, actualNo: true, status: true, actualDate: true, workers: true, employees: { select: { employeeName: true } } } } } },
  inspections: { where: { status: 'COMPLETED' }, select: { id: true, inspectionNo: true, inspector: true, result: true, checkedAt: true }, orderBy: { checkedAt: 'desc' as const } },
} satisfies Prisma.InventoryLotInclude

export function warehousePackingProvenance(lot: Prisma.InventoryLotGetPayload<{ include: typeof warehousePackingLotInclude }>) {
  const actual = lot.productionOutput?.actual
  const productionPersonnel = actual?.status === 'CONFIRMED'
    ? Array.from(new Set(actual.employees.length > 0 ? actual.employees.map((employee) => employee.employeeName.trim()).filter(Boolean) : actual.workers.split(/[,，、;；\n]/).map((name) => name.trim()).filter(Boolean)))
    : []
  const qualityPersonnel = Array.from(new Set(lot.inspections.map((inspection) => inspection.inspector?.trim()).filter((name): name is string => Boolean(name))))
  return { productionPersonnel, qualityPersonnel, productionDate: actual?.status === 'CONFIRMED' ? actual.actualDate : null, actualId: actual?.id || null, inspections: lot.inspections }
}
