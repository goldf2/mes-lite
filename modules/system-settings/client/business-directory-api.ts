import type { DirectoryDiagnostics } from '@/modules/platform-integration'

export async function loadBusinessDirectoryDiagnostics(): Promise<DirectoryDiagnostics> {
  const response = await fetch('/api/system/business-directory', { cache: 'no-store' })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '读取 API 接入状态失败')
  return payload.data
}
