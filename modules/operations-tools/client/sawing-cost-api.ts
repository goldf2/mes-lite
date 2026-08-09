import type {
  SaveSawingScenarioInput,
  SavedSawingScenario,
  SawingCostWorkspace,
  SawingProcessOption,
  SawingProductOption,
} from '../contracts/sawing-cost'

interface ApiPayload<T> {
  data?: T
  error?: string
  processTemplates?: SawingProcessOption[]
  products?: SawingProductOption[]
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = await response.json() as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error || '锯切成本请求失败')
  return payload
}

export async function loadSawingCostWorkspace(): Promise<SawingCostWorkspace> {
  const payload = await request<SavedSawingScenario[]>('/api/sawing-cost-scenarios')
  return {
    scenarios: payload.data || [],
    processOptions: payload.processTemplates || [],
    productOptions: payload.products || [],
  }
}

export async function saveSawingCostScenario(input: SaveSawingScenarioInput) {
  const payload = await request<SavedSawingScenario>('/api/sawing-cost-scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!payload.data) throw new Error('保存锯切成本后未返回方案')
  return payload.data
}
