import { Prisma, PrismaClient } from '@prisma/client'
import {
  getUnitCatalog,
  measureTypeLabels,
  saveUnitCatalogOrder,
  unitCatalogKey,
} from './unit-catalog'

export const configurationOrderEntities = [
  'locations',
  'suppliers',
  'customers',
  'employees',
  'workCenters',
  'processTemplates',
  'processRoutes',
  'units',
] as const

export type ConfigurationOrderEntity = (typeof configurationOrderEntities)[number]

export interface ConfigurationOrderItem {
  id: string
  label: string
  detail?: string
  group?: string
  sortOrder: number
}

type ConfigurationClient = PrismaClient | Prisma.TransactionClient

export async function listConfigurationOrder(
  client: ConfigurationClient,
  entity: ConfigurationOrderEntity,
): Promise<ConfigurationOrderItem[]> {
  switch (entity) {
    case 'locations': {
      const rows = await client.inventoryLocation.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
      return rows.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}`, detail: row.isActive ? (row.isDefault ? '默认库位' : '启用') : '已归档', sortOrder: row.sortOrder }))
    }
    case 'suppliers': {
      const rows = await client.supplier.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
      return rows.map((row) => ({ id: row.id, label: row.name, detail: row.contact || undefined, sortOrder: row.sortOrder }))
    }
    case 'customers': {
      const rows = await client.customer.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
      return rows.map((row) => ({ id: row.id, label: row.name, detail: row.contact || undefined, sortOrder: row.sortOrder }))
    }
    case 'employees': {
      const rows = await client.employee.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
      return rows.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}`, detail: row.isActive ? row.department || '在职' : '已停用', sortOrder: row.sortOrder }))
    }
    case 'workCenters': {
      const rows = await client.workCenter.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
      return rows.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}`, detail: row.isActive ? row.category || '启用' : '已归档', sortOrder: row.sortOrder }))
    }
    case 'processTemplates': {
      const rows = await client.processTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
      return rows.map((row) => ({ id: row.id, label: `${row.code} · ${row.name}`, detail: row.category, sortOrder: row.sortOrder }))
    }
    case 'processRoutes': {
      const rows = await client.processRoute.findMany({ include: { product: { select: { sku: true, name: true } } }, orderBy: [{ sortOrder: 'asc' }, { product: { sku: 'asc' } }] })
      return rows.map((row) => ({ id: row.id, label: `${row.product.sku} · ${row.name}`, detail: row.product.name, sortOrder: row.sortOrder }))
    }
    case 'units': {
      const rows = await getUnitCatalog(client)
      return rows.map((row) => ({
        id: unitCatalogKey(row),
        label: `${row.name}（${row.code}）`,
        detail: `1 ${row.code} = ${row.toBaseFactor} 基准单位`,
        group: measureTypeLabels[row.measureType],
        sortOrder: row.sortOrder,
      }))
    }
  }
}

export async function saveConfigurationOrder(
  client: ConfigurationClient,
  entity: ConfigurationOrderEntity,
  orderedIds: string[],
) {
  const current = await listConfigurationOrder(client, entity)
  const expected = new Set(current.map((item) => item.id))
  if (orderedIds.length !== expected.size || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !expected.has(id))) {
    throw new Error('排序内容已变化，请刷新后重试')
  }

  if (entity === 'units') {
    const currentGroups = new Map(current.map((item) => [item.id, item.group]))
    const groupSequenceChanged = orderedIds.some((id, index) => currentGroups.get(id) !== current[index]?.group)
    if (groupSequenceChanged) throw new Error('单位只能在相同计量类别内排序')
    await saveUnitCatalogOrder(orderedIds, client)
    return listConfigurationOrder(client, entity)
  }

  for (let sortOrder = 0; sortOrder < orderedIds.length; sortOrder += 1) {
    const id = orderedIds[sortOrder]
    switch (entity) {
      case 'locations': await client.inventoryLocation.update({ where: { id }, data: { sortOrder } }); break
      case 'suppliers': await client.supplier.update({ where: { id }, data: { sortOrder } }); break
      case 'customers': await client.customer.update({ where: { id }, data: { sortOrder } }); break
      case 'employees': await client.employee.update({ where: { id }, data: { sortOrder } }); break
      case 'workCenters': await client.workCenter.update({ where: { id }, data: { sortOrder } }); break
      case 'processTemplates': await client.processTemplate.update({ where: { id }, data: { sortOrder } }); break
      case 'processRoutes': await client.processRoute.update({ where: { id }, data: { sortOrder } }); break
    }
  }
  return listConfigurationOrder(client, entity)
}

export async function nextConfigurationSortOrder(
  client: ConfigurationClient,
  entity: Exclude<ConfigurationOrderEntity, 'units'>,
) {
  switch (entity) {
    case 'locations': return ((await client.inventoryLocation.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    case 'suppliers': return ((await client.supplier.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    case 'customers': return ((await client.customer.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    case 'employees': return ((await client.employee.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    case 'workCenters': return ((await client.workCenter.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    case 'processTemplates': return ((await client.processTemplate.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    case 'processRoutes': return ((await client.processRoute.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
  }
}
