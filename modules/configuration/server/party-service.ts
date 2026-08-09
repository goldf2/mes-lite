import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { nextConfigurationSortOrder } from './configuration-order-service'
import { createInternalCode } from '@/lib/internal-codes'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import type { PartyInput } from '../contracts/party-schema'
import type { PartyKind } from '../contracts/reference-data'
import { PartyDomainError } from '../domain/party-errors'
import { getPartyKindDefinition } from '../domain/party-kind'

type PartyEntity = {
  id: string
  code: string
  name: string
  contact: string | null
  phone: string | null
  address: string | null
  deletedAt: Date | null
  deletedBy: string | null
  sortOrder: number
  createdAt: Date
}

type PartyWriteData = {
  name: string
  contact: string | null
  phone: string | null
  address: string | null
}

interface PartyPersistenceAdapter {
  list(tokens: string[]): Promise<PartyEntity[]>
  findById(tx: Prisma.TransactionClient, id: string): Promise<PartyEntity | null>
  findActiveByName(tx: Prisma.TransactionClient, name: string, excludeId?: string): Promise<PartyEntity | null>
  create(tx: Prisma.TransactionClient, data: PartyWriteData & { code: string; sortOrder: number }): Promise<PartyEntity>
  update(tx: Prisma.TransactionClient, id: string, data: PartyWriteData): Promise<PartyEntity>
  archive(tx: Prisma.TransactionClient, id: string, archivedAt: Date): Promise<PartyEntity>
}

function partySearchWhere(tokens: string[]) {
  return {
    deletedAt: null,
    ...(tokens.length > 0 ? {
      AND: tokens.map((token) => ({ OR: [
        { name: { contains: token } },
        { code: { contains: token } },
        { contact: { contains: token } },
        { phone: { contains: token } },
        { address: { contains: token } },
      ] })),
    } : {}),
  }
}

function activeNameWhere(name: string, excludeId?: string) {
  return {
    name,
    deletedAt: null,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  }
}

const supplierAdapter: PartyPersistenceAdapter = {
  list: (tokens) => prisma.supplier.findMany({
    where: partySearchWhere(tokens),
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  }),
  findById: (tx, id) => tx.supplier.findUnique({ where: { id } }),
  findActiveByName: (tx, name, excludeId) => tx.supplier.findFirst({ where: activeNameWhere(name, excludeId) }),
  create: (tx, data) => tx.supplier.create({ data }),
  update: (tx, id, data) => tx.supplier.update({ where: { id }, data }),
  archive: (tx, id, archivedAt) => tx.supplier.update({ where: { id }, data: { deletedAt: archivedAt } }),
}

const customerAdapter: PartyPersistenceAdapter = {
  list: (tokens) => prisma.customer.findMany({
    where: partySearchWhere(tokens),
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  }),
  findById: (tx, id) => tx.customer.findUnique({ where: { id } }),
  findActiveByName: (tx, name, excludeId) => tx.customer.findFirst({ where: activeNameWhere(name, excludeId) }),
  create: (tx, data) => tx.customer.create({ data }),
  update: (tx, id, data) => tx.customer.update({ where: { id }, data }),
  archive: (tx, id, archivedAt) => tx.customer.update({ where: { id }, data: { deletedAt: archivedAt } }),
}

const adapters: Record<PartyKind, PartyPersistenceAdapter> = {
  supplier: supplierAdapter,
  customer: customerAdapter,
}

function normalizePartyInput(input: PartyInput): PartyWriteData {
  return {
    name: input.name.trim(),
    contact: input.contact?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  }
}

function createPartyCode(kind: PartyKind) {
  if (kind === 'supplier') {
    return `SUP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`
  }
  return createInternalCode('cus')
}

async function assertPartyNameAvailable(
  tx: Prisma.TransactionClient,
  kind: PartyKind,
  adapter: PartyPersistenceAdapter,
  name: string,
  excludeId?: string,
) {
  const definition = getPartyKindDefinition(kind)
  if (!definition.uniqueActiveName) return
  if (await adapter.findActiveByName(tx, name, excludeId)) {
    throw new PartyDomainError(`${definition.label}名称已存在`)
  }
}

export async function listManagedParties(kind: PartyKind, keyword?: string | null) {
  return adapters[kind].list(tokenizeKeywordQuery(keyword?.trim() || ''))
}

export async function createManagedParty(kind: PartyKind, input: PartyInput) {
  const definition = getPartyKindDefinition(kind)
  const adapter = adapters[kind]
  const data = normalizePartyInput(input)
  return prisma.$transaction(async (tx) => {
    await assertPartyNameAvailable(tx, kind, adapter, data.name)
    return adapter.create(tx, {
      ...data,
      code: createPartyCode(kind),
      sortOrder: await nextConfigurationSortOrder(tx, definition.orderEntity),
    })
  })
}
export async function updateManagedParty(kind: PartyKind, id: string, input: PartyInput) {
  const definition = getPartyKindDefinition(kind)
  const adapter = adapters[kind]
  const data = normalizePartyInput(input)
  return prisma.$transaction(async (tx) => {
    const current = await adapter.findById(tx, id)
    if (!current || current.deletedAt) throw new PartyDomainError(`${definition.label}不存在`, 404)
    await assertPartyNameAvailable(tx, kind, adapter, data.name, id)
    const updated = await adapter.update(tx, id, data)
    return { current, updated }
  })
}

export async function archiveManagedParty(kind: PartyKind, id: string, archivedAt = new Date()) {
  const definition = getPartyKindDefinition(kind)
  const adapter = adapters[kind]
  return prisma.$transaction(async (tx) => {
    const current = await adapter.findById(tx, id)
    if (!current || current.deletedAt) throw new PartyDomainError(`${definition.label}不存在或已归档`, 404)
    const archived = await adapter.archive(tx, id, archivedAt)
    return { current, archived }
  })
}
