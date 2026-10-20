import { withAttachmentUrls } from '@/lib/attachment-urls'
import { prisma } from '@/lib/prisma'
import { requireManagedAttachmentAccessForOperator } from '@/modules/attachments/server-index'
import type { EffectiveDataScope } from '@/modules/identity-access'
import type { TaskDocumentReference } from './task-reference-service'

type FileMetadata = Omit<TaskDocumentReference, 'attachmentId' | 'versionLabel'>

/**
 * Hydrate presentation-only metadata after checking each source's own resource
 * permission and data scope. Cache by attachment ID across the whole response;
 * never trust metadata that may have arrived in a persisted reference.
 */
export async function hydrateTaskFileReferenceGroups(
  scope: EffectiveDataScope,
  groups: TaskDocumentReference[][],
): Promise<TaskDocumentReference[][]> {
  const ids = Array.from(new Set(groups.flatMap((refs) => refs.map((ref) => ref.attachmentId))))
  if (ids.length === 0) return groups.map(() => [])
  const operator = await prisma.operator.findFirst({
    where: { id: scope.operatorId, status: 'ACTIVE' },
    select: { id: true, username: true, name: true, role: true },
  })
  const metadata = new Map<string, FileMetadata>()
  // Limit concurrent permission/owner queries while sharing results for repeated
  // references in task-level files, BOM lines and the progress timeline.
  for (let offset = 0; offset < ids.length; offset += 8) {
    await Promise.all(ids.slice(offset, offset + 8).map(async (id) => {
      if (!operator) {
        metadata.set(id, { fileUnavailable: true })
        return
      }
      try {
        const { attachment } = await requireManagedAttachmentAccessForOperator(operator, id, 'read')
        const urls = withAttachmentUrls({
          id: attachment.id,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          rotation: attachment.rotation,
          previewRevision: attachment.previewRevision,
        })
        metadata.set(id, {
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          rotation: attachment.rotation,
          previewRevision: attachment.previewRevision,
          previewKind: urls.previewKind,
          url: urls.url,
          originalUrl: urls.url,
          previewUrl: urls.previewUrl,
          thumbnailUrl: urls.thumbnailUrl,
          fileUnavailable: false,
        })
      } catch (error) {
        if (error instanceof Error && ['AttachmentDomainError', 'DataScopeError'].includes(error.name)) {
          metadata.set(id, { fileUnavailable: true })
          return
        }
        throw error
      }
    }))
  }
  return groups.map((refs) => refs.map((ref) => ({
    attachmentId: ref.attachmentId,
    ...(ref.versionLabel !== undefined ? { versionLabel: ref.versionLabel } : {}),
    ...metadata.get(ref.attachmentId),
  })))
}
