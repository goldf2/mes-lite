import { removeAttachmentStoredFiles } from '@/lib/attachment-thumbnail'
import type { EffectiveDataScope } from '@/modules/identity-access'
import type { ArchiveModel } from '../contracts/maintenance'
import { purgeArchivedRecord } from './archived-record-purge-service'

export async function purgeArchivedRecordAndFiles(model: ArchiveModel, id: string, scope: EffectiveDataScope) {
  const result = await purgeArchivedRecord(model, id, scope)
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
