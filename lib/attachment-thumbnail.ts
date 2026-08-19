import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { normalizeAttachmentRotation } from './attachment-rotation'
import { ensureOfficeDocumentPreview } from './office-document-preview'
import { ensureCadDocumentPreview } from './files/cad-document-preview'
import { attachmentPreviewKind } from './attachment-file-types'
import { resolveAttachmentStoragePath } from './attachment-storage'

export { attachmentUploadRoot, resolveAttachmentStoragePath } from './attachment-storage'

const maxThumbnailWidth = 640
const maxThumbnailHeight = 480
const generationTasks = new Map<string, Promise<string>>()

type ThumbnailSource = {
  storagePath: string
  originalName?: string | null
  mimeType: string
  rotation?: number | null
}

export function attachmentThumbnailStoragePath(storagePath: string, rotation = 0) {
  const resolved = resolveAttachmentStoragePath(storagePath)
  return `${resolved}.thumb-r${normalizeAttachmentRotation(rotation)}.png`
}

function scaledSize(width: number, height: number) {
  const scale = Math.min(
    1,
    maxThumbnailWidth / Math.max(width, 1),
    maxThumbnailHeight / Math.max(height, 1)
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

async function renderImageThumbnail(sourcePath: string, rotation: number) {
  const image = await loadImage(await readFile(sourcePath))
  const quarterTurn = rotation === 90 || rotation === 270
  const rotatedWidth = quarterTurn ? image.height : image.width
  const rotatedHeight = quarterTurn ? image.width : image.height
  const size = scaledSize(rotatedWidth, rotatedHeight)
  const canvas = createCanvas(size.width, size.height)
  const context = canvas.getContext('2d')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.translate(size.width / 2, size.height / 2)
  context.rotate(rotation * Math.PI / 180)
  context.drawImage(
    image,
    -image.width * size.scale / 2,
    -image.height * size.scale / 2,
    image.width * size.scale,
    image.height * size.scale
  )

  return canvas.encode('png')
}

async function renderPdfThumbnail(sourcePath: string, targetPath: string, savedRotation: number) {
  const workerPath = path.join(process.cwd(), 'scripts', 'render-pdf-thumbnail.mjs')
  await new Promise<void>((resolve, reject) => {
    const worker = spawn(process.execPath, [workerPath, sourcePath, targetPath, String(savedRotation)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    worker.stderr.setEncoding('utf8')
    worker.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000)
    })
    const timeout = setTimeout(() => worker.kill('SIGKILL'), 30_000)
    worker.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    worker.on('exit', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`PDF thumbnail worker failed (${signal || code}): ${stderr.trim() || 'no details'}`))
    })
  })
  return targetPath
}

async function generateAttachmentThumbnail(source: ThumbnailSource, targetPath: string) {
  const sourcePath = resolveAttachmentStoragePath(source.storagePath)
  const rotation = normalizeAttachmentRotation(Number(source.rotation || 0))
  const previewKind = attachmentPreviewKind(source.originalName || sourcePath, source.mimeType)
  if (previewKind === 'pdf' || previewKind === 'office' || previewKind === 'cad') {
    await mkdir(path.dirname(targetPath), { recursive: true })
    const pdfPath = previewKind === 'office'
      ? await ensureOfficeDocumentPreview(source)
      : previewKind === 'cad'
        ? await ensureCadDocumentPreview(source)
        : sourcePath
    return renderPdfThumbnail(pdfPath, targetPath, rotation)
  }
  const png = previewKind === 'image'
    ? await renderImageThumbnail(sourcePath, rotation)
    : null

  if (!png) throw new Error('该附件类型不支持缩略图')
  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${randomUUID()}`
  await writeFile(temporaryPath, png)
  await rename(temporaryPath, targetPath)
  return targetPath
}

export async function ensureAttachmentThumbnail(source: ThumbnailSource) {
  const targetPath = attachmentThumbnailStoragePath(
    source.storagePath,
    Number(source.rotation || 0)
  )

  try {
    await access(targetPath)
    return targetPath
  } catch {
    // 首次访问或方向变化后生成新缩略图。
  }

  const running = generationTasks.get(targetPath)
  if (running) return running

  const task = generateAttachmentThumbnail(source, targetPath)
    .finally(() => generationTasks.delete(targetPath))
  generationTasks.set(targetPath, task)
  return task
}

export async function removeAttachmentStoredFiles(storagePath: string) {
  const sourcePath = resolveAttachmentStoragePath(storagePath)
  const directory = path.dirname(sourcePath)
  const baseName = path.basename(sourcePath)
  const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const storedNames = entries.filter((name) => (
    name === baseName
    || (name.startsWith(`${baseName}.thumb-r`) && name.endsWith('.png'))
    || (name.startsWith(`${baseName}.image-`) && name.endsWith('.webp'))
    || (name.startsWith(`${baseName}.preview-v`) && name.endsWith('.pdf'))
    || (name.startsWith(`${baseName}.preview-cad-v`) && name.endsWith('.pdf'))
  ))
  await Promise.all(storedNames.map((name) => rm(path.join(directory, name), { force: true })))
}
