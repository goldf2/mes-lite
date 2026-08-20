import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isCadAttachment } from '@/lib/attachment-file-types'
import { resolveAttachmentStoragePath } from '@/lib/attachment-storage'

type CadPreviewSource = {
  storagePath: string
  originalName?: string | null
  mimeType: string
}

export const cadPreviewVersion = 2
const maxPreviewBytes = 100 * 1024 * 1024
const conversionTasks = new Map<string, Promise<string>>()

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

export function cadPreviewStoragePath(storagePath: string) {
  return `${resolveAttachmentStoragePath(storagePath)}.preview-cad-v${cadPreviewVersion}.pdf`
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
  if (!cadPreviewServiceUrl()) return { configured: false as const, available: false as const }
  try {
    const response = await fetchWithTimeout(serviceEndpoint('/health'), { headers: serviceHeaders() }, 5_000)
    return { configured: true as const, available: response.ok }
  } catch {
    return { configured: true as const, available: false as const }
  }
}

async function convertCadDocument(source: CadPreviewSource, targetPath: string) {
  const sourcePath = resolveAttachmentStoragePath(source.storagePath)
  if (!isCadAttachment(source.originalName || sourcePath, source.mimeType)) {
    throw new Error('该附件不是可转换的 DWG/DXF 图纸')
  }

  const sourceFile = await readFile(sourcePath)
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(sourceFile)], { type: source.mimeType || 'application/octet-stream' }), source.originalName || path.basename(sourcePath))
  form.append('output', 'pdf')

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

export async function ensureCadDocumentPreview(source: CadPreviewSource) {
  const targetPath = cadPreviewStoragePath(source.storagePath)
  try {
    await access(targetPath)
    return targetPath
  } catch {
    // 首次打开时通过隔离的 CAD 转换服务生成派生 PDF，原文件保持不变。
  }

  const running = conversionTasks.get(targetPath)
  if (running) return running
  const task = convertCadDocument(source, targetPath)
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
    && path.join(directory, name) !== currentTarget
  ))
  await Promise.all(previews.map((name) => rm(path.join(directory, name), { force: true })))
}

export async function regenerateCadDocumentPreview(source: CadPreviewSource) {
  const targetPath = cadPreviewStoragePath(source.storagePath)
  const running = conversionTasks.get(targetPath)
  if (running) return running

  const task = convertCadDocument(source, targetPath)
    .then(async (result) => {
      await removeStaleCadDocumentPreviewFiles(source.storagePath, targetPath)
      return result
    })
    .finally(() => conversionTasks.delete(targetPath))
  conversionTasks.set(targetPath, task)
  return task
}
