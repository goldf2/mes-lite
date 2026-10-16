import { listDirectoryCustomers } from '@/modules/configuration/server-index'
import {
  DIRECTORY_SCHEMA_VERSION, directoryResources,
  type DirectoryDiagnostics, type DirectoryEnvelope, type DirectoryQuery, type DirectoryRecord, type DirectoryResource, type DirectorySource,
} from '../contracts/business-directory'
import { readDirectoryConfiguration } from '../domain/business-directory'
import { directoryDelegateStatus } from './directory-authorization'

export async function getBusinessDirectory(resource: DirectoryResource, source: DirectorySource, query: DirectoryQuery): Promise<DirectoryEnvelope> {
  const customers = await listDirectoryCustomers(query.q, query.enterpriseId)
  const records: DirectoryRecord[] = []
  for (const customer of customers) {
    const contact = customer.contact?.trim() || null
    const address = customer.address?.trim() || null
    const phone = customer.phone?.trim() || null
    if (resource === 'contacts' && !contact) continue
    if (resource === 'locations' && !address) continue
    const id = resource === 'contacts' ? `customer-contact:${customer.id}`
      : resource === 'locations' ? `customer-address:${customer.id}` : customer.id
    const base = {
      id, revision: null, updatedAt: null,
      sourceRef: { ...source, resource, recordId: id }, projection: true as const, readOnly: true as const,
    }
    if (resource === 'enterprises') records.push({ ...base, code: customer.code, name: customer.name, primaryContactName: contact, phone, email: null, address })
    if (resource === 'contacts') records.push({ ...base, enterpriseId: customer.id, enterpriseName: customer.name, name: contact!, phone, email: null, role: null })
    if (resource === 'locations') records.push({ ...base, enterpriseId: customer.id, enterpriseName: customer.name, name: customer.name, address: address!, province: null, city: null, coordinate: null })
  }
  return {
    schemaVersion: DIRECTORY_SCHEMA_VERSION, source, resource,
    records: records.slice(query.offset, query.offset + query.limit),
    page: { limit: query.limit, offset: query.offset, total: records.length, hasMore: query.offset + query.limit < records.length },
  }
}

export async function getBusinessDirectoryDiagnostics(): Promise<DirectoryDiagnostics> {
  const config = readDirectoryConfiguration()
  const delegate = config.operatorConfigured
    ? await directoryDelegateStatus(config.operatorId)
    : { active: false, canReadCustomers: false }
  return {
    schemaVersion: DIRECTORY_SCHEMA_VERSION,
    enabled: config.enabled,
    ready: config.enabled && config.configured && !config.expired && delegate.active && delegate.canReadCustomers,
    source: config.source, scopeKind: 'deployment-source-labels', requiredPermission: 'customers.read',
    credentialConfigured: config.credentialConfigured,
    expiresAt: config.expiresAt, expired: config.expired,
    delegate: { configured: config.operatorConfigured, ...delegate },
    missingConfiguration: config.missingConfiguration,
    resources: directoryResources.map((resource) => ({
      resource, method: 'GET', path: `/api/integrations/business-directory/v1/${resource}`, projection: true, readOnly: true,
    })),
  }
}
