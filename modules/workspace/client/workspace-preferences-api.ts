import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '工作台设置请求失败')
  return payload.data as T
}

export function loadWorkspacePreference() {
  return request<WorkspacePreferenceValue>('/api/workspace-preferences')
}

export function saveWorkspacePreference(input: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) {
  return request<Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>>('/api/workspace-preferences', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}

export function recordWorkspaceUsage(functionKey: WorkspaceFunctionKey) {
  return request('/api/workspace-usage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ functionKey }),
  })
}
