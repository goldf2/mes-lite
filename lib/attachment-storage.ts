import path from 'path'

export function attachmentUploadRoot() {
  return path.resolve(
    process.env.MES_LITE_UPLOAD_DIR
      || path.join(process.cwd(), 'public', 'uploads')
  )
}

function containedRelativePath(candidatePath: string, root: string) {
  const relativePath = path.relative(root, candidatePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null
  return relativePath
}

export function attachmentLegacyUploadRoot() {
  return path.resolve(process.env.MES_LITE_LEGACY_UPLOAD_DIR || '/app/public/uploads')
}

export function resolveAttachmentStoragePath(storagePath: string) {
  const root = attachmentUploadRoot()
  const resolved = path.resolve(storagePath)
  const currentRelativePath = containedRelativePath(resolved, root)
  if (currentRelativePath) return path.join(root, currentRelativePath)

  const legacyRelativePath = containedRelativePath(resolved, attachmentLegacyUploadRoot())
  if (legacyRelativePath) return path.join(root, legacyRelativePath)

  throw new Error('附件路径无效')
}
