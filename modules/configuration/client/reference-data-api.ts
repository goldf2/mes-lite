import type {
  ConfiguredUnit,
  DocumentCategoryConfig,
  InventoryLocationConfig,
  InventoryLocationForm,
  PartyForm,
  PartyKind,
  PartyRecord,
  UnitForm,
} from '../contracts/reference-data'

interface ApiPayload<T> {
  data?: T
  error?: string
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '业务配置请求失败')
  return payload.data
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const partyEndpoint = (kind: PartyKind) => kind === 'supplier' ? '/api/suppliers' : '/api/customers'

export async function loadParties(kind: PartyKind) {
  return await request<PartyRecord[]>(partyEndpoint(kind)) || []
}

export async function saveParty(kind: PartyKind, form: PartyForm, id?: string) {
  await request<PartyRecord>(partyEndpoint(kind), jsonRequest(id ? 'PUT' : 'POST', {
    ...form,
    id,
    contact: form.contact || undefined,
    phone: form.phone || undefined,
    address: form.address || undefined,
  }))
}

export async function archiveParty(kind: PartyKind, id: string) {
  await request<unknown>(`${partyEndpoint(kind)}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function loadInventoryLocations() {
  return await request<InventoryLocationConfig[]>('/api/inventory-locations?includeInactive=1') || []
}

export async function saveInventoryLocation(form: InventoryLocationForm, id?: string) {
  return await request<InventoryLocationConfig[]>('/api/inventory-locations', jsonRequest(id ? 'PATCH' : 'POST', id ? { ...form, id } : form)) || []
}

export async function archiveInventoryLocation(id: string) {
  return await request<InventoryLocationConfig[]>(`/api/inventory-locations?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) || []
}

export async function makeDefaultInventoryLocation(id: string) {
  return await request<InventoryLocationConfig[]>('/api/inventory-locations', jsonRequest('PATCH', { id, isDefault: true, isActive: true })) || []
}

export async function loadConfiguredUnits(signal?: AbortSignal) {
  return await request<ConfiguredUnit[]>('/api/system/units', { signal }) || []
}

export async function saveConfiguredUnit(form: UnitForm, original?: Pick<ConfiguredUnit, 'code' | 'measureType'>) {
  return await request<ConfiguredUnit[]>('/api/system/units', jsonRequest(original ? 'PATCH' : 'POST', original ? {
    ...form,
    originalCode: original.code,
    originalMeasureType: original.measureType,
  } : form)) || []
}

export async function removeConfiguredUnit(unit: Pick<ConfiguredUnit, 'code' | 'measureType'>) {
  const params = new URLSearchParams({ code: unit.code, measureType: unit.measureType })
  return await request<ConfiguredUnit[]>(`/api/system/units?${params.toString()}`, { method: 'DELETE' }) || []
}

export async function loadDocumentCategories() {
  return await request<DocumentCategoryConfig[]>('/api/document-categories') || []
}
