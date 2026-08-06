import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { normalizeAttachmentRotation } from './attachment-rotation'
import { resolveAttachmentStoragePath } from './attachment-thumbnail'

export const ATTACHMENT_IMAGE_PROFILE_VERSION = 1

export type AttachmentImageVariant = 'thumbnail' | 'display'

type ImageVariantSource = {
  storagePath: string
  mimeType: string
  size: number
  rotation?: number | null
}

const profiles: Record<AttachmentImageVariant, { maxWidth: number; maxHeight: number; quality: number }> = {
  thumbnail: { maxWidth: 320, maxHeight: 320, quality: 78 },
  display: { maxWidth: 1600, maxHeight: 1600, quality: 84 },
}

const generationTasks = new Map<string, Promise<string>>()

export function isAttachmentImageVariant(value: string): value is AttachmentImageVariant {
  return value === 'thumbnail' || value === 'display'
}

export function attachmentImageVariantVersion(source: Pick<ImageVariantSource, 'size' | 'rotation'>) {
  return `${ATTACHMENT_IMAGE_PROFILE_VERSION}-${source.size}-${normalizeAttachmentRotation(Number(source.rotation || 0))}`
}

export function attachmentImageVariantStoragePath(source: ImageVariantSource, variant: AttachmentImageVariant) {
  const resolved = resolveAttachmentStoragePath(source.storagePath)
  const rotation = normalizeAttachmentRotation(Number(source.rotation || 0))
  return `${resolved}.image-${variant}-r${rotation}-s${source.size}-v${ATTACHMENT_IMAGE_PROFILE_VERSION}.webp`
}

function scaledSize(width: number, height: number, variant: AttachmentImageVariant) {
  const profile = profiles[variant]
  const scale = Math.min(
    1,
    profile.maxWidth / Math.max(width, 1),
    profile.maxHeight / Math.max(height, 1),
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

async function generateAttachmentImageVariant(
  source: ImageVariantSource,
  variant: AttachmentImageVariant,
  targetPath: string,
) {
  if (!source.mimeType.startsWith('image/')) throw new Error('该附件类型不支持图片优化')

  const sourcePath = resolveAttachmentStoragePath(source.storagePath)
  const image = await loadImage(await readFile(sourcePath))
  const rotation = normalizeAttachmentRotation(Number(source.rotation || 0))
  const quarterTurn = rotation === 90 || rotation === 270
  const rotatedWidth = quarterTurn ? image.height : image.width
  const rotatedHeight = quarterTurn ? image.width : image.height
  const size = scaledSize(rotatedWidth, rotatedHeight, variant)
  const canvas = createCanvas(size.width, size.height)
  const context = canvas.getContext('2d')

  context.translate(size.width / 2, size.height / 2)
  context.rotate(rotation * Math.PI / 180)
  context.drawImage(
    image,
    -image.width * size.scale / 2,
    -image.height * size.scale / 2,
    image.width * size.scale,
    image.height * size.scale,
  )

  const encoded = await canvas.encode('webp', profiles[variant].quality)
  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${randomUUID()}`
  await writeFile(temporaryPath, encoded)
  await rename(temporaryPath, targetPath)
  return targetPath
}

export async function ensureAttachmentImageVariant(source: ImageVariantSource, variant: AttachmentImageVariant) {
  const targetPath = attachmentImageVariantStoragePath(source, variant)
  try {
    await access(targetPath)
    return targetPath
  } catch {
    // 首次访问、原图变化或方向变化后生成新版本。
  }

  const running = generationTasks.get(targetPath)
  if (running) return running

  const task = generateAttachmentImageVariant(source, variant, targetPath)
    .finally(() => generationTasks.delete(targetPath))
  generationTasks.set(targetPath, task)
  return task
}

export async function inspectAttachmentImageVariants(source: ImageVariantSource) {
  const result = await Promise.all((Object.keys(profiles) as AttachmentImageVariant[]).map(async (variant) => {
    const storagePath = attachmentImageVariantStoragePath(source, variant)
    try {
      const file = await stat(storagePath)
      return [variant, { exists: true, bytes: file.size, storagePath }] as const
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [variant, { exists: false, bytes: 0, storagePath }] as const
      }
      throw error
    }
  }))
  return Object.fromEntries(result) as Record<AttachmentImageVariant, { exists: boolean; bytes: number; storagePath: string }>
}

export async function removeAttachmentImageVariants(storagePath: string) {
  const sourcePath = resolveAttachmentStoragePath(storagePath)
  const directory = path.dirname(sourcePath)
  const baseName = path.basename(sourcePath)
  const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const variants = entries.filter((name) => name.startsWith(`${baseName}.image-`) && name.endsWith('.webp'))
  await Promise.all(variants.map((name) => rm(path.join(directory, name), { force: true })))
}
