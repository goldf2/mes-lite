import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isCadAttachment } from '@/lib/attachment-file-types'
import { resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { normalizeCadPreviewEngine, type CadPreviewEngine, type CadPreviewServiceStatus } from '@/lib/cad-preview-engines'

type CadPreviewSource = {
  storagePath: string
  originalName?: string | null
  mimeType: string
}

export const cadPreviewVersion = 3
const maxPreviewBytes = 100 * 1024 * 1024
const conversionTasks = new Map<string, Promise<string>>()
const conversionWaiters: Array<() => void> = []
let activeConversions = 0

function maxConcurrentConversions() {
  const value = Number(process.env.CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS || 2)
  return Number.isInteger(value) && value >= 1 && value <= 8 ? value : 2
}

async function withConversionSlot<T>(task: () => Promise<T>) {
  const limit = maxConcurrentConversions()
  if (activeConversions >= limit) {
    await new Promise<void>((resolve) => conversionWaiters.push(resolve))
  }
  activeConversions += 1
  try {
    return await task()
  } finally {
    activeConversions -= 1
    conversionWaiters.shift()?.()
  }
}

function configuredTimeout() {
  const value = Number(process.env.CAD_PREVIEW_TIMEOUT_MS || 120_000)
  return Number.isFinite(value) && value >= 5_000 && value <= 10 * 60_000 ? value : 120_000
}

export function cadPreviewServiceUrl() {
  const configured = process.env.CAD_PREVIEW_SERVICE_URL?.trim()
  if (!configured) return null
  const url = new URL(configured.endsWith('/') ? configured : `${configured}/`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('CAD 预览服务地址必须使用 HTTP 或 HTTPS')
  return url
}

export function cadPreviewCacheKey(engine: CadPreviewEngine = 'auto') {
  return `cad-v${cadPreviewVersion}-${normalizeCadPreviewEngine(engine)}`
}

export function cadPreviewStoragePath(storagePath: string, engine: CadPreviewEngine = 'auto') {
  return `${resolveAttachmentStoragePath(storagePath)}.preview-${cadPreviewCacheKey(engine)}.pdf`
}

function serviceEndpoint(pathname: string) {
  const baseUrl = cadPreviewServiceUrl()
  if (!baseUrl) throw new Error('CAD 预览服务未配置')
  return new URL(pathname.replace(/^\//, ''), baseUrl)
}

function serviceHeaders() {
  const token = process.env.CAD_PREVIEW_SERVICE_TOKEN?.trim()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

async function fetchWithTimeout(input: URL, init?: RequestInit, timeoutMs = configuredTimeout()) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkCadPreviewService() {
  const unavailable: CadPreviewServiceStatus = { configured: false, available: false, autoOrder: [], engines: [] }
  if (!cadPreviewServiceUrl()) return unavailable
  try {
    const response = await fetchWithTimeout(serviceEndpoint('/health'), { headers: serviceHeaders() }, 5_000)
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() as { autoOrder?: unknown; engines?: unknown }
      : {}
    const engines = Array.isArray(payload.engines)
      ? payload.engines.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const source = item as { engine?: unknown; available?: unknown; detail?: unknown }
        const engine = normalizeCadPreviewEngine(source.engine)
        if (engine === 'auto') return []
        return [{ engine, available: source.available === true, detail: typeof source.detail === 'string' ? source.detail : '' }]
      })
      : []
    const autoOrder = Array.isArray(payload.autoOrder)
      ? payload.autoOrder.map(normalizeCadPreviewEngine).filter((item): item is Exclude<CadPreviewEngine, 'auto'> => item !== 'auto')
      : []
    return { configured: true, available: response.ok, autoOrder, engines }
  } catch {
    return { ...unavailable, configured: true }
  }
}

async function convertCadDocument(source: CadPreviewSource, targetPath: string, engine: CadPreviewEngine) {
  const sourcePath = resolveAttachmentStoragePath(source.storagePath)
  if (!isCadAttachment(source.originalName || sourcePath, source.mimeType)) {
    throw new Error('该附件不是可转换的 DWG/DXF 图纸')
  }

  const sourceFile = await readFile(sourcePath)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(sourceFile)], { type: source.mimeType || 'application/octet-stream' }), source.originalName || path.basename(sourcePath))
  form.append('output', 'pdf')
  form.append('engine', normalizeCadPreviewEngine(engine))

  const response = await fetchWithTimeout(serviceEndpoint('/v1/convert/pdf'), {
    method: 'POST',
    headers: serviceHeaders(),
    body: form,
  })
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 1000)
    throw new Error(`CAD 预览转换失败 (${response.status})${detail ? `：${detail}` : ''}`)
  }
  const converted = Buffer.from(await response.arrayBuffer())
  if (converted.length === 0 || converted.length > maxPreviewBytes || !converted.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('CAD 预览服务返回的 PDF 无效')
  }

  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryTarget = `${targetPath}.tmp-${randomUUID()}`
  await writeFile(temporaryTarget, converted)
  await rename(temporaryTarget, targetPath)
  return targetPath
}

export async function ensureCadDocumentPreview(source: CadPreviewSource, engine: CadPreviewEngine = 'auto') {
  const normalizedEngine = normalizeCadPreviewEngine(engine)
  const targetPath = cadPreviewStoragePath(source.storagePath, normalizedEngine)
  try {
    await access(targetPath)
    return targetPath
  } catch {
    // 首次打开时通过隔离的 CAD 转换服务生成派生 PDF，原文件保持不变。
  }

  const running = conversionTasks.get(targetPath)
  if (running) return running
  const task = withConversionSlot(() => convertCadDocument(source, targetPath, normalizedEngine))
    .finally(() => conversionTasks.delete(targetPath))
  conversionTasks.set(targetPath, task)
  return task
}

async function removeStaleCadDocumentPreviewFiles(storagePath: string, currentTarget: string) {
  const sourcePath = resolveAttachmentStoragePath(storagePath)
  const directory = path.dirname(sourcePath)
  const baseName = path.basename(sourcePath)
  const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const previews = entries.filter((name) => (
    name.startsWith(`${baseName}.preview-cad-v`) && name.endsWith('.pdf')
    && !name.startsWith(`${baseName}.preview-cad-v${cadPreviewVersion}-`)
    && path.join(directory, name) !== currentTarget
  ))
  await Promise.all(previews.map((name) => rm(path.join(directory, name), { force: true })))
}

export async function regenerateCadDocumentPreview(source: CadPreviewSource, engine: CadPreviewEngine = 'auto') {
  const normalizedEngine = normalizeCadPreviewEngine(engine)
  const targetPath = cadPreviewStoragePath(source.storagePath, normalizedEngine)
  const running = conversionTasks.get(targetPath)
  if (running) return running

  const task = withConversionSlot(() => convertCadDocument(source, targetPath, normalizedEngine))
    .then(async (result) => {
      await removeStaleCadDocumentPreviewFiles(source.storagePath, targetPath)
      return result
    })
    .finally(() => conversionTasks.delete(targetPath))
  conversionTasks.set(targetPath, task)
  return task
}
