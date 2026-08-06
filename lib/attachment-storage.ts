import path from 'path'

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
