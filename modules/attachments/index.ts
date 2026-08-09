export {
  AttachmentApiError,
  archiveAttachment,
  discardDraftAttachments,
  finalizeDraftAttachments,
  listAttachments,
  setAttachmentCover,
  setAttachmentRotation,
  uploadAttachment,
} from './client/attachment-api'
export type { AttachmentMutationInput, AttachmentUploadInput, DraftAttachmentInput } from './contracts/attachment-schema'
export { attachmentUpdatePermissionResource } from './domain/attachment-policy'
