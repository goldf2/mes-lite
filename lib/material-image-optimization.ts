import { prisma } from './prisma'
import {
  ensureAttachmentImageVariant,
  inspectAttachmentImageVariants,
} from './attachment-image-variants'

export const MATERIAL_IMAGE_OPTIMIZATION_SCOPE = 'MATERIAL_IMAGES' as const

type MaterialImageAttachment = {
  id: string
  ownerId: string
  originalName: string
  mimeType: string
  size: number
  storagePath: string
  rotation: number
}

async function getMaterialImageAttachments(ids?: string[]) {
  return prisma.documentAttachment.findMany({
    where: {
      ownerType: 'MATERIAL',
      documentType: 'MATERIAL_IMAGE',
      mimeType: { startsWith: 'image/' },
      deletedAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      ownerId: true,
      originalName: true,
      mimeType: true,
      size: true,
      storagePath: true,
      rotation: true,
    },
  })
}

export async function getMaterialImageOptimizationPreview() {
  const attachments = await getMaterialImageAttachments()
  const materialIds = Array.from(new Set(attachments.map((attachment) => attachment.ownerId)))
  const materials = materialIds.length === 0 ? [] : await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, code: true, name: true },
  })
  const materialById = new Map(materials.map((material) => [material.id, material]))

  const items = await Promise.all(attachments.map(async (attachment) => {
    const variants = await inspectAttachmentImageVariants(attachment)
    const material = materialById.get(attachment.ownerId)
    const optimized = variants.thumbnail.exists && variants.display.exists
    return {
      attachmentId: attachment.id,
      materialId: attachment.ownerId,
      materialCode: material?.code || '-',
      materialName: material?.name || '已删除物料',
      originalName: attachment.originalName,
      originalBytes: attachment.size,
      optimizedBytes: variants.thumbnail.bytes + variants.display.bytes,
      thumbnailReady: variants.thumbnail.exists,
      displayReady: variants.display.exists,
      optimized,
    }
  }))

  return {
    scope: MATERIAL_IMAGE_OPTIMIZATION_SCOPE,
    totalCount: items.length,
    optimizedCount: items.filter((item) => item.optimized).length,
    pendingCount: items.filter((item) => !item.optimized).length,
    originalBytes: items.reduce((sum, item) => sum + item.originalBytes, 0),
    optimizedBytes: items.reduce((sum, item) => sum + item.optimizedBytes, 0),
    pendingAttachmentIds: items.filter((item) => !item.optimized).map((item) => item.attachmentId),
    items,
  }
}

export async function optimizeMaterialImages(attachmentIds: string[]) {
  const attachments = await getMaterialImageAttachments(attachmentIds)
  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]))
  const results: Array<{
    attachmentId: string
    success: boolean
    optimizedBytes: number
    error?: string
  }> = []

  for (const attachmentId of attachmentIds) {
    const attachment = attachmentById.get(attachmentId) as MaterialImageAttachment | undefined
    if (!attachment) {
      results.push({ attachmentId, success: false, optimizedBytes: 0, error: '物料图片不存在' })
      continue
    }
    try {
      await ensureAttachmentImageVariant(attachment, 'thumbnail')
      await ensureAttachmentImageVariant(attachment, 'display')
      const variants = await inspectAttachmentImageVariants(attachment)
      results.push({
        attachmentId,
        success: true,
        optimizedBytes: variants.thumbnail.bytes + variants.display.bytes,
      })
    } catch (error) {
      results.push({
        attachmentId,
        success: false,
        optimizedBytes: 0,
        error: error instanceof Error ? error.message : '图片优化失败',
      })
    }
  }

  return results
}
