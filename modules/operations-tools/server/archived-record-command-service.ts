import { removeAttachmentStoredFiles } from '@/lib/attachment-thumbnail'
import type { ArchiveModel } from '../contracts/maintenance'
import { purgeArchivedRecord } from './archived-record-purge-service'

export async function purgeArchivedRecordAndFiles(model: ArchiveModel, id: string) {
  const result = await purgeArchivedRecord(model, id)
  let fileCleanupFailed = false
  for (const storagePath of result.attachmentStoragePaths) {
    try {
      await removeAttachmentStoredFiles(storagePath)
    } catch (error) {
      fileCleanupFailed = true
      console.error('Remove archived record attachment files error:', error)
    }
  }
  return { result, fileCleanupFailed }
}
