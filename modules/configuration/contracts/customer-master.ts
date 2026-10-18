import { z } from 'zod'
export const customerMasterResources = ['enterprises', 'contacts', 'locations'] as const
export type CustomerMasterResource = typeof customerMasterResources[number]
export const masterId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
const source = z.object({ appId: z.literal('equipment-maintenance'), instanceId: z.string().min(1).max(128), tenantId: z.literal('local'), workspaceId: z.literal('default') }).strict()
const ref = source.extend({ resource: z.enum(customerMasterResources), recordId: masterId }).strict()
const common = { id: masterId, name: z.string().min(1), revision: z.number().int().positive(), updatedAt: z.string().datetime({ offset: true }), sourceRef: ref, projection: z.literal(false), readOnly: z.literal(true) }
export const masterEnterpriseSchema = z.object({ ...common, code: z.string(), businessUse: z.literal('approved') }).strict()
export const masterContactSchema = z.object({ ...common, enterpriseId: masterId, enterpriseName: z.string(), useStatus: z.literal('active'), phone: z.string(), email: z.string(), role: z.string() }).strict()
export const masterLocationSchema = z.object({ ...common, enterpriseId: masterId, enterpriseName: z.string(), useStatus: z.literal('active'), address: z.string(), province: z.string(), city: z.string(), coordinate: z.object({ crs: z.literal('WGS84'), longitude: z.number().finite().min(-180).max(180), latitude: z.number().finite().min(-90).max(90), source: z.string(), confidence: z.string() }).strict().nullable() }).strict()
export const masterRecordSchemas = { enterprises: masterEnterpriseSchema, contacts: masterContactSchema, locations: masterLocationSchema }
export const masterEnvelopeSchema = z.object({ schemaVersion: z.literal('customer-master.v1'), source, resource: z.enum(customerMasterResources), records: z.array(z.unknown()).max(100), page: z.object({ limit: z.number().int().min(1).max(100), offset: z.number().int().min(0).max(100000), total: z.number().int().nonnegative(), hasMore: z.boolean() }).strict() }).strict()
export type MasterEnterprise = z.infer<typeof masterEnterpriseSchema>
export type MasterContact = z.infer<typeof masterContactSchema>
export type MasterLocation = z.infer<typeof masterLocationSchema>
export type MasterRecord = MasterEnterprise | MasterContact | MasterLocation
export interface MasterEnvelope { managementHref?: string; schemaVersion: 'customer-master.v1'; source: z.infer<typeof source>; resource: CustomerMasterResource; records: MasterRecord[]; page: { limit: number; offset: number; total: number; hasMore: boolean } }
export interface CustomerMasterView { instanceId: string; enterpriseId: string; revision: number | null; status: 'current' | 'unavailable'; managementHref: string }
export const linkCustomerMasterSchema = z.object({ customerId: z.string().min(1).optional(), enterpriseId: masterId, expectedRevision: z.number().int().positive() }).strict()
export const customerMasterSnapshotSchema = z.object({ schemaVersion: z.literal('customer-master-snapshot.v1'), enterpriseRef: ref, revision: z.number().int().positive(), capturedAt: z.string().datetime(), name: z.string(), contact: z.string(), phone: z.string(), address: z.string(), contactId: masterId.nullable(), locationId: masterId.nullable(), contactRevision: z.number().int().positive().nullable(), locationRevision: z.number().int().positive().nullable() }).strict()
export type CustomerMasterSnapshot = z.infer<typeof customerMasterSnapshotSchema>
export interface CustomerMasterSelection { customerMasterContactId?: string; customerMasterLocationId?: string; customerMasterRevision?: number; customerMasterContactRevision?: number; customerMasterLocationRevision?: number }
export function readCustomerMasterSnapshot(raw?: string | null) {
  if (!raw) return null
  try { return customerMasterSnapshotSchema.parse(JSON.parse(raw)) }
  catch { throw new Error('CUSTOMER_MASTER_SNAPSHOT_INVALID') }
}
