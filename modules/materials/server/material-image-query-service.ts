import { prisma } from '@/lib/prisma'
import { withMaterialImageUrls } from '@/lib/attachment-urls'
import type { MaterialImage } from '../contracts'

export async function loadPrimaryMaterialImageMap(materialIds: string[]): Promise<Map<string, MaterialImage>> {
  const uniqueIds = Array.from(new Set(materialIds.filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, MaterialImage>()
  const images = await prisma.documentAttachment.findMany({
    where: {
      ownerType: 'MATERIAL', ownerId: { in: uniqueIds }, documentType: 'MATERIAL_IMAGE',
      mimeType: { startsWith: 'image/' }, deletedAt: null,
    },
    orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true, size: true, rotation: true },
  })
  const result = new Map<string, MaterialImage>()
  for (const image of images) if (!result.has(image.ownerId)) result.set(image.ownerId, withMaterialImageUrls(image))
  return result
}
