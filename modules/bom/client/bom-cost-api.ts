import type {
  BomCostData,
  BomCostObjectInput,
  BomCostProductOption,
  BomCostRun,
  BomCostRunInput,
} from '../contracts/bom-cost'

async function jsonOrError<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || fallback)
  return payload as T
}

export async function loadBomCostWorkspace(productId = '') {
  const url = productId ? `/api/bom-costs?productId=${encodeURIComponent(productId)}` : '/api/bom-costs'
  return jsonOrError<{ products: BomCostProductOption[]; runs: BomCostRun[] }>(await fetch(url), '获取 BOM 成本数据失败')
}

export async function loadBomCostData() {
  return jsonOrError<BomCostData>(await fetch('/api/cost-objects'), '获取成本数据失败')
}

export async function calculateBomCost(input: BomCostRunInput) {
  const response = await fetch('/api/bom-costs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return (await jsonOrError<{ data: BomCostRun }>(response, 'BOM 成本计算失败')).data
}

export async function createBomCostObject(input: BomCostObjectInput) {
  const response = await fetch('/api/cost-objects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return jsonOrError(response, '保存成本对象失败')
}
