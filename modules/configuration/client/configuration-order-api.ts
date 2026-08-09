import type { ConfigurationOrderEntity, ConfigurationOrderItem } from '../contracts/configuration-order'

async function readResponse(response: Response, fallback: string) {
  const payload = await response.json() as { data?: ConfigurationOrderItem[]; error?: string; message?: string }
  if (!response.ok) throw new Error(payload.error || fallback)
  return payload
}

export async function loadConfigurationOrder(entity: ConfigurationOrderEntity) {
  const payload = await readResponse(
    await fetch(`/api/system/configuration-order?entity=${encodeURIComponent(entity)}`),
    '获取配置顺序失败',
  )
  return payload.data || []
}

export async function saveConfigurationOrderPreference(entity: ConfigurationOrderEntity, orderedIds: string[]) {
  return readResponse(await fetch('/api/system/configuration-order', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity, orderedIds }),
  }), '保存配置顺序失败')
}
