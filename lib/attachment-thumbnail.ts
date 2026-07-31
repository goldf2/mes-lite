import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { createCanvas, DOMMatrix, ImageData, loadImage, Path2D } from '@napi-rs/canvas'
import { normalizeAttachmentRotation } from './attachment-rotation'

const maxThumbnailWidth = 640
const maxThumbnailHeight = 480
const generationTasks = new Map<string, Promise<string>>()

type ThumbnailSource = {
  storagePath: string
  mimeType: string
  rotation?: number | null
}

export function attachmentUploadRoot() {
  return path.resolve(
    process.env.MES_LITE_UPLOAD_DIR
      || path.join(process.cwd(), 'public', 'uploads')
  )
}

export function resolveAttachmentStoragePath(storagePath: string) {
  const root = attachmentUploadRoot()
  const resolved = path.resolve(storagePath)
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('附件路径无效')
  }
  return resolved
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

async function renderPdfThumbnail(sourcePath: string, savedRotation: number) {
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await readFile(sourcePath)),
    useSystemFonts: true,
  })

  try {
    const document = await loadingTask.promise
    if (document.numPages < 1) throw new Error('PDF 没有可预览页面')
    const page = await document.getPage(1)
    const rotation = normalizeAttachmentRotation(Number(page.rotate || 0) + savedRotation)
    const baseViewport = page.getViewport({ scale: 1, rotation })
    const size = scaledSize(baseViewport.width, baseViewport.height)
    const viewport = page.getViewport({ scale: size.scale, rotation })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')

    await page.render({
      canvas: canvas as any,
      canvasContext: context as any,
      viewport,
      background: '#ffffff',
    }).promise
    page.cleanup()
    return canvas.encode('png')
  } finally {
    await loadingTask.destroy()
  }
}

async function generateAttachmentThumbnail(source: ThumbnailSource, targetPath: string) {
  const sourcePath = resolveAttachmentStoragePath(source.storagePath)
  const rotation = normalizeAttachmentRotation(Number(source.rotation || 0))
  const png = source.mimeType === 'application/pdf'
    ? await renderPdfThumbnail(sourcePath, rotation)
    : source.mimeType.startsWith('image/')
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
  ))
  await Promise.all(storedNames.map((name) => rm(path.join(directory, name), { force: true })))
}
