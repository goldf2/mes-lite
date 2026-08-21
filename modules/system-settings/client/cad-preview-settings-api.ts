import { normalizeCadPreviewEngine, type CadPreviewServiceStatus } from '@/lib/cad-preview-engines'
import type { CadPreviewSettings } from '../contracts/system-settings'

function normalizeService(value: unknown): CadPreviewServiceStatus {
  const source = value && typeof value === 'object' ? value as Partial<CadPreviewServiceStatus> : {}
  return {
    configured: source.configured === true,
    available: source.available === true,
    autoOrder: Array.isArray(source.autoOrder)
      ? source.autoOrder.filter((item): item is 'libredwg' | 'acadsharp' | 'qcad' => ['libredwg', 'acadsharp', 'qcad'].includes(String(item)))
      : [],
    engines: Array.isArray(source.engines) ? source.engines : [],
  }
}

async function readResponse(response: Response, fallback: string): Promise<CadPreviewSettings> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || fallback)
  return {
    engine: normalizeCadPreviewEngine(payload.data?.engine),
    service: normalizeService(payload.data?.service),
  }
}

export async function loadCadPreviewSettings() {
  return readResponse(await fetch('/api/system/settings?scope=cadPreview', { cache: 'no-store' }), '获取 CAD 预览设置失败')
}

export async function updateCadPreviewSettings(engine: CadPreviewSettings['engine']) {
  return readResponse(await fetch('/api/system/settings?scope=cadPreview', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cadPreviewEngine: engine }),
  }), '保存 CAD 预览设置失败')
}
