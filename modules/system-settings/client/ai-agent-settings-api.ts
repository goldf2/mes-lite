import type { AiAgentConfigPatch, AiAgentConfigView } from '../contracts/system-settings'

async function readConfig(response: Response, fallbackMessage: string): Promise<AiAgentConfigView> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || fallbackMessage)
  return payload.data
}

export async function loadAiAgentConfig() {
  return readConfig(await fetch('/api/ai/config'), '获取 AI 配置失败')
}

export async function updateAiAgentConfig(patch: AiAgentConfigPatch) {
  return readConfig(await fetch('/api/ai/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }), '保存 AI 配置失败')
}

export async function testAiAgentConnection() {
  const response = await fetch('/api/ai/config', { method: 'POST' })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'AI 服务连接测试失败')
  return Number(payload.data?.latencyMs || 0)
}
