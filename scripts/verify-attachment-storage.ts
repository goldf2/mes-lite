import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-attachment-storage-'))
  const uploadRoot = path.join(temporaryRoot, 'uploads')
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot
  process.env.MES_LITE_LEGACY_UPLOAD_DIR = '/app/public/uploads'

  const {
    attachmentLegacyUploadRoot,
    attachmentUploadRoot,
    resolveAttachmentStoragePath,
  } = await import('../lib/attachment-storage')

  try {
  assert.equal(attachmentUploadRoot(), uploadRoot)
  assert.equal(attachmentLegacyUploadRoot(), '/app/public/uploads')
  assert.equal(
    resolveAttachmentStoragePath(path.join(uploadRoot, 'MATERIAL', 'material-1', 'drawing.pdf')),
    path.join(uploadRoot, 'MATERIAL', 'material-1', 'drawing.pdf'),
  )
  assert.equal(
    resolveAttachmentStoragePath('/app/public/uploads/MATERIAL/material-1/drawing.pdf'),
    path.join(uploadRoot, 'MATERIAL', 'material-1', 'drawing.pdf'),
    '恢复到新挂载后，旧容器绝对路径必须安全映射到当前附件根目录',
  )
  assert.throws(
    () => resolveAttachmentStoragePath('/app/public/uploads/../secrets/secret.txt'),
    /附件路径无效/,
    '旧路径不得利用上级目录越出附件根目录',
  )
  assert.throws(
    () => resolveAttachmentStoragePath('/tmp/untrusted-uploads/file.txt'),
    /附件路径无效/,
    '未配置的外部绝对路径不得重定位',
  )
  assert.throws(
    () => resolveAttachmentStoragePath(uploadRoot),
    /附件路径无效/,
    '附件记录必须指向根目录内的文件，不能指向根目录自身',
  )
    console.log('附件路径验证通过：当前根目录、旧容器路径重定位与越界拒绝均符合预期。')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
