export const CAD_PREVIEW_ENGINES = ['auto', 'libredwg', 'acadsharp', 'qcad'] as const

export type CadPreviewEngine = (typeof CAD_PREVIEW_ENGINES)[number]

export const DEFAULT_CAD_PREVIEW_ENGINE: CadPreviewEngine = 'auto'

export function normalizeCadPreviewEngine(value: unknown): CadPreviewEngine {
  return CAD_PREVIEW_ENGINES.includes(value as CadPreviewEngine)
    ? value as CadPreviewEngine
    : DEFAULT_CAD_PREVIEW_ENGINE
}

export interface CadPreviewEngineStatus {
  engine: Exclude<CadPreviewEngine, 'auto'>
  available: boolean
  detail: string
}

export interface CadPreviewServiceStatus {
  configured: boolean
  available: boolean
  autoOrder: Array<Exclude<CadPreviewEngine, 'auto'>>
  engines: CadPreviewEngineStatus[]
}
