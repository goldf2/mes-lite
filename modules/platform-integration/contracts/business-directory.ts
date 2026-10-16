export const DIRECTORY_SCHEMA_VERSION = 'business-directory.v1' as const
export const directoryResources = ['enterprises', 'contacts', 'locations'] as const
export type DirectoryResource = typeof directoryResources[number]

export interface DirectorySource {
  appId: 'mes-lite'
  instanceId: string
  tenantId: string
  workspaceId: string
}

export interface DirectorySourceRef extends DirectorySource {
  resource: DirectoryResource
  recordId: string
}

interface DirectoryProjection {
  id: string
  revision: null
  updatedAt: null
  sourceRef: DirectorySourceRef
  projection: true
  readOnly: true
}

export interface DirectoryEnterprise extends DirectoryProjection {
  code: string
  name: string
  primaryContactName: string | null
  phone: string | null
  email: null
  address: string | null
}

export interface DirectoryContact extends DirectoryProjection {
  enterpriseId: string
  enterpriseName: string
  name: string
  phone: string | null
  email: null
  role: null
}

export interface DirectoryLocation extends DirectoryProjection {
  enterpriseId: string
  enterpriseName: string
  name: string
  address: string
  province: null
  city: null
  coordinate: null
}

export type DirectoryRecord = DirectoryEnterprise | DirectoryContact | DirectoryLocation
export interface DirectoryQuery { q: string; enterpriseId: string | null; limit: number; offset: number }
export interface DirectoryEnvelope {
  schemaVersion: typeof DIRECTORY_SCHEMA_VERSION
  source: DirectorySource
  resource: DirectoryResource
  records: DirectoryRecord[]
  page: { limit: number; offset: number; total: number; hasMore: boolean }
}

export interface DirectoryDiagnostics {
  schemaVersion: typeof DIRECTORY_SCHEMA_VERSION
  enabled: boolean
  ready: boolean
  source: DirectorySource | null
  scopeKind: 'deployment-source-labels'
  requiredPermission: 'customers.read'
  credentialConfigured: boolean
  expiresAt: string | null
  expired: boolean
  delegate: { configured: boolean; active: boolean; canReadCustomers: boolean }
  missingConfiguration: string[]
  resources: Array<{ resource: DirectoryResource; method: 'GET'; path: string; projection: true; readOnly: true }>
}
