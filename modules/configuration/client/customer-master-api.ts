import type { CustomerMasterResource, MasterEnvelope, MasterEnterprise } from '../contracts/customer-master'
import type { PartyRecord } from '../contracts/reference-data'

const errors: Record<string, string> = {
  CUSTOMER_MASTER_UNAVAILABLE: '共享客户资料暂不可用，请检查接入配置或稍后重试。',
  CUSTOMER_MAINTAINED_IN_DATA_PLATFORM: '客户统一在数据平台维护，请使用“在数据平台维护”。',
  CUSTOMER_MASTER_CASDOOR_LOGIN_REQUIRED: '请使用统一账号登录后读取共享联系人。',
  CUSTOMER_MASTER_RECORD_NOT_FOUND: '资料已不可用，请刷新后重新选择。',
  CUSTOMER_MASTER_FORBIDDEN: '你没有查看或关联共享客户的权限。',
  CUSTOMER_MASTER_LINK_REQUIRED: '此客户尚未关联数据平台，请先在客户管理中关联正式客户。',
  CUSTOMER_MASTER_LINK_CONFLICT: '此客户已经关联其他主档，不能直接替换。',
  CUSTOMER_MASTER_ALREADY_LINKED: '该共享客户已用于 MES，请刷新后选择已有客户。',
  CUSTOMER_MASTER_EXPLICIT_EXISTING_CUSTOMER_REQUIRED: 'MES 已有同名客户，请在该客户旁明确关联，不能自动合并或重复新建。',
  CUSTOMER_MASTER_REVISION_CONFLICT: '主档已经更新，请刷新资料后重新确认联系人和地点。',
}

export function customerMasterMessage(code: string) {
  return errors[code] || '共享客户操作未完成，请刷新后重试。'
}

export function masterRecordManagementHref(collectionHref: string | undefined, id: string) {
  return collectionHref ? `${collectionHref.replace(/\/$/, '')}/${encodeURIComponent(id)}` : undefined
}

export async function loadCustomerDirectory(signal?: AbortSignal) {
  const response = await fetch('/api/customers', { cache: 'no-store', signal })
  const value = await response.json()
  if (!response.ok) throw new Error('客户资料读取失败。')
  return value as {
    data: PartyRecord[]
    customerMaster?: { enabled: boolean; managementHref: string | null }
  }
}

export async function loadCustomerMaster(resource: CustomerMasterResource, params = new URLSearchParams(), id?: string, signal?: AbortSignal) {
  const response = await fetch(`/api/customer-master/${resource}${id ? `/${encodeURIComponent(id)}` : params.size ? `?${params}` : ''}`, { cache: 'no-store', signal })
  const value = await response.json()
  if (!response.ok) throw new Error(customerMasterMessage(value.error))
  return value as MasterEnvelope
}

export async function linkSharedCustomer(enterpriseId: string, expectedRevision: number, customerId?: string) {
  const response = await fetch('/api/customers/master-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId, expectedRevision, ...(customerId ? { customerId } : {}) }),
  })
  const value = await response.json()
  if (!response.ok) throw new Error(customerMasterMessage(value.error))
  return value.data as { customerId: string }
}

export async function loadCustomerMasterChoices(customerId: string, signal?: AbortSignal) {
  const result = await loadCustomerDirectory(signal)
  if (!result.customerMaster?.enabled) return null
  const item = result.data.find(row => row.id === customerId)
  if (!item?.master) throw new Error(customerMasterMessage('CUSTOMER_MASTER_LINK_REQUIRED'))
  if (item.master.status !== 'current') throw new Error('共享客户资料暂不可用，恢复后才能保存新单据。')
  const enterprise = await loadCustomerMaster('enterprises', new URLSearchParams(), item.master.enterpriseId, signal)
  if (!enterprise.records[0]) throw new Error('共享客户已不可用，请重新关联有效的正式客户。')
  return { enterprise: enterprise.records[0] as MasterEnterprise, managementHref: enterprise.managementHref }
}
