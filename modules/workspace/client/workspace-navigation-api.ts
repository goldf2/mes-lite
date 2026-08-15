import type { WorkspaceNavigationConfig } from '@/lib/workspace-navigation-config'

export const workspaceNavigationChangedEvent = 'mes-lite.workspace-navigation.changed'

export function announceWorkspaceNavigationConfig(config: WorkspaceNavigationConfig) {
  window.dispatchEvent(new CustomEvent(workspaceNavigationChangedEvent, { detail: config }))
}

export async function loadWorkspaceNavigationConfig() {
  const response = await fetch('/api/system/workspace-navigation')
  const payload = await response.json() as { data?: WorkspaceNavigationConfig; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '获取导航菜单配置失败')
  return payload.data
}

export async function saveWorkspaceNavigationConfig(config: WorkspaceNavigationConfig) {
  const response = await fetch('/api/system/workspace-navigation', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
  })
  const payload = await response.json() as { data?: WorkspaceNavigationConfig; error?: string }
  if (!response.ok || !payload.data) throw new Error(payload.error || '保存导航菜单配置失败')
  return payload.data
}
