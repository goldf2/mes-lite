import type { SopCatalog } from '../contracts/sop'

export async function loadSopCatalog(pageKey: string | undefined, signal: AbortSignal) {
  const query = pageKey ? `?pageKey=${encodeURIComponent(pageKey)}` : ''
  const response = await fetch(`/api/sop${query}`, { signal })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '加载 SOP 失败')
  return payload.data as SopCatalog
}
