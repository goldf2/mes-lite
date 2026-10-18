import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createInternalCode } from '@/lib/internal-codes'
import { nextConfigurationSortOrder } from './configuration-order-service'
import { customerMasterConfiguration, customerMasterEnabled, masterManagementHref, CustomerMasterError, fetchCustomerMaster } from './customer-master-client'
import { type CustomerMasterSelection, type CustomerMasterSnapshot, type CustomerMasterView, type MasterEnterprise, type MasterContact, type MasterLocation } from '../contracts/customer-master'

type CustomerLabel = { id: string; code: string; name: string; createdAt?: Date; sortOrder?: number; contact?: string | null; phone?: string | null; address?: string | null }
export async function customerMasterViews<T extends CustomerLabel>(customers: T[], full: boolean) {
  const links = await prisma.customerMasterLink.findMany({ where: { customerId: { in: customers.map(c => c.id) } } })
  const views = new Map<string, { enterprise?: MasterEnterprise; master: CustomerMasterView }>()
  if (full) for (let offset = 0; offset < links.length; offset += 4) await Promise.all(links.slice(offset, offset + 4).map(async link => {
    const master: CustomerMasterView = { instanceId: link.instanceId, enterpriseId: link.enterpriseId, revision: null, status: 'unavailable', managementHref: '' }
    try {
      if (customerMasterConfiguration().instanceId !== link.instanceId) throw new CustomerMasterError('CUSTOMER_MASTER_SOURCE_MISMATCH')
      master.managementHref = masterManagementHref('enterprises', link.enterpriseId)
      const enterprise = (await fetchCustomerMaster('enterprises', new URLSearchParams(), link.enterpriseId)).records[0] as MasterEnterprise
      views.set(link.customerId, { enterprise, master: { ...master, revision: enterprise.revision, status: 'current' } })
    } catch { views.set(link.customerId, { master }) }
  }))
  return customers.map(customer => {
    const view = views.get(customer.id), enterprise = view?.enterprise
    const label = { id: customer.id, code: customer.code, name: enterprise?.name || customer.name, createdAt: customer.createdAt, sortOrder: customer.sortOrder }
    // Local values are historical compatibility data, never a fallback for unavailable shared contacts.
    const legacy = full && !customerMasterEnabled() && !links.some(link => link.customerId === customer.id)
    return { ...label, contact: legacy ? customer.contact : null, phone: legacy ? customer.phone : null, address: legacy ? customer.address : null, ...(view ? { master: view.master } : {}) }
  })
}
export async function assertCustomerLocallyEditable(tx: Prisma.TransactionClient, customerId: string) {
  if (customerMasterEnabled()) throw new CustomerMasterError('CUSTOMER_MAINTAINED_IN_DATA_PLATFORM', 409)
  if (await tx.customerMasterLink.findUnique({ where: { customerId } })) throw new CustomerMasterError('CUSTOMER_MAINTAINED_IN_DATA_PLATFORM', 409)
}
export async function linkCustomerMaster(input: { customerId?: string; enterpriseId: string; expectedRevision: number }) {
  const config = customerMasterConfiguration()
  const enterprise = (await fetchCustomerMaster('enterprises', new URLSearchParams(), input.enterpriseId)).records[0] as MasterEnterprise
  if (enterprise.revision !== input.expectedRevision) throw new CustomerMasterError('CUSTOMER_MASTER_REVISION_CONFLICT', 409)
  try { return await prisma.$transaction(async tx => {
    const duplicate = await tx.customerMasterLink.findUnique({ where: { instanceId_enterpriseId: { instanceId: config.instanceId, enterpriseId: enterprise.id } } })
    if (duplicate && (!input.customerId || duplicate.customerId !== input.customerId)) throw new CustomerMasterError('CUSTOMER_MASTER_ALREADY_LINKED', 409)
    let customer
    if (input.customerId) {
      customer = await tx.customer.findUnique({ where: { id: input.customerId } })
      if (!customer || customer.deletedAt) throw new CustomerMasterError('CUSTOMER_NOT_ACTIVE', 404)
      const existing = await tx.customerMasterLink.findUnique({ where: { customerId: customer.id } })
      if (existing) {
        if (existing.instanceId !== config.instanceId || existing.enterpriseId !== enterprise.id) throw new CustomerMasterError('CUSTOMER_MASTER_LINK_CONFLICT', 409)
        return { customerId: customer.id, enterpriseId: enterprise.id, createdReference: false, linkCreated: false }
      }
    } else {
      if (await tx.customer.findFirst({ where: { name: enterprise.name, deletedAt: null } })) throw new CustomerMasterError('CUSTOMER_MASTER_EXPLICIT_EXISTING_CUSTOMER_REQUIRED', 409)
      // Explicit command only: this compatibility label/FK is never updated as a second master.
      customer = await tx.customer.create({ data: { code: createInternalCode('cus'), name: enterprise.name, sortOrder: await nextConfigurationSortOrder(tx, 'customers') } })
    }
    await tx.customerMasterLink.create({ data: { customerId: customer.id, instanceId: config.instanceId, enterpriseId: enterprise.id, boundRevision: enterprise.revision } })
    return { customerId: customer.id, enterpriseId: enterprise.id, createdReference: !input.customerId, linkCreated: true }
  }) } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new CustomerMasterError('CUSTOMER_MASTER_LINK_CONFLICT', 409)
    throw error
  }
}
export async function captureCustomerMasterSnapshot(customerId: string, selection: CustomerMasterSelection = {}): Promise<CustomerMasterSnapshot | null> {
  const link = await prisma.customerMasterLink.findUnique({ where: { customerId } })
  if (!link) {
    if (customerMasterEnabled() || selection.customerMasterContactId || selection.customerMasterLocationId || selection.customerMasterRevision || selection.customerMasterContactRevision || selection.customerMasterLocationRevision) throw new CustomerMasterError('CUSTOMER_MASTER_LINK_REQUIRED', 409)
    return null
  }
  if (customerMasterConfiguration().instanceId !== link.instanceId) throw new CustomerMasterError('CUSTOMER_MASTER_SOURCE_MISMATCH')
  const enterprise = (await fetchCustomerMaster('enterprises', new URLSearchParams(), link.enterpriseId)).records[0] as MasterEnterprise
  if (selection.customerMasterRevision !== enterprise.revision) throw new CustomerMasterError('CUSTOMER_MASTER_REVISION_CONFLICT', 409)
  const contact = selection.customerMasterContactId ? (await fetchCustomerMaster('contacts', new URLSearchParams(), selection.customerMasterContactId)).records[0] as MasterContact : null
  const location = selection.customerMasterLocationId ? (await fetchCustomerMaster('locations', new URLSearchParams(), selection.customerMasterLocationId)).records[0] as MasterLocation : null
  if ((contact && selection.customerMasterContactRevision !== contact.revision) || (location && selection.customerMasterLocationRevision !== location.revision) || (!contact && selection.customerMasterContactRevision) || (!location && selection.customerMasterLocationRevision)) throw new CustomerMasterError('CUSTOMER_MASTER_REVISION_CONFLICT', 409)
  if ((contact && contact.enterpriseId !== enterprise.id) || (location && location.enterpriseId !== enterprise.id)) throw new CustomerMasterError('CUSTOMER_MASTER_RELATION_MISMATCH', 409)
  return { schemaVersion: 'customer-master-snapshot.v1', enterpriseRef: enterprise.sourceRef, revision: enterprise.revision, capturedAt: new Date().toISOString(), name: enterprise.name, contact: contact?.name ?? '', phone: contact?.phone ?? '', address: location?.address ?? '', contactId: contact?.id ?? null, locationId: location?.id ?? null, contactRevision: contact?.revision ?? null, locationRevision: location?.revision ?? null }
}
export async function assertSnapshotLinkCurrent(tx: Prisma.TransactionClient, customerId: string, snapshot: CustomerMasterSnapshot | null) {
  const link = await tx.customerMasterLink.findUnique({ where: { customerId } })
  if (Boolean(link) !== Boolean(snapshot) || (link && snapshot && (link.instanceId !== snapshot.enterpriseRef.instanceId || link.enterpriseId !== snapshot.enterpriseRef.recordId))) throw new CustomerMasterError('CUSTOMER_MASTER_LINK_CHANGED', 409)
}
