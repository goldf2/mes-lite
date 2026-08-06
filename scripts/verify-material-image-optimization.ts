import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  ensureAttachmentImageVariant,
  inspectAttachmentImageVariants,
} from '../lib/attachment-image-variants'
import { removeAttachmentStoredFiles } from '../lib/attachment-thumbnail'
import { withMaterialImageUrls } from '../lib/attachment-urls'

async function main() {
  const uploadRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-image-optimization-'))
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot
  const sourcePath = path.join(uploadRoot, 'MATERIAL', 'material-1', 'source.png')
  const canvas = createCanvas(2400, 1200)
  const context = canvas.getContext('2d')
  context.fillStyle = '#2563eb'
  context.fillRect(0, 0, 2400, 1200)
  context.fillStyle = '#ffffff'
  context.font = 'bold 180px sans-serif'
  context.fillText('MES-lite', 620, 680)
  const original = await canvas.encode('png')
  await mkdir(path.dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, original)

  const source = {
    id: 'attachment-1',
    storagePath: sourcePath,
    mimeType: 'image/png',
    size: original.length,
    rotation: 0,
  }
  const thumbnailPath = await ensureAttachmentImageVariant(source, 'thumbnail')
  const displayPath = await ensureAttachmentImageVariant(source, 'display')
  const thumbnail = await loadImage(await readFile(thumbnailPath))
  const display = await loadImage(await readFile(displayPath))
  assert.equal(thumbnail.width, 320)
  assert.equal(thumbnail.height, 160)
  assert.equal(display.width, 1600)
  assert.equal(display.height, 800)
  assert.deepEqual(await readFile(sourcePath), original, '生成派生图不得修改原图')

  const status = await inspectAttachmentImageVariants(source)
  assert.equal(status.thumbnail.exists, true)
  assert.equal(status.display.exists, true)
  assert.ok(status.thumbnail.bytes > 0)
  assert.ok(status.display.bytes > 0)

  const urls = withMaterialImageUrls(source)
  assert.match(urls.thumbnailUrl, /\/image\/thumbnail\?v=1-/)
  assert.match(urls.displayUrl, /\/image\/display\?v=1-/)
  assert.equal(urls.url, urls.displayUrl)
  assert.equal(urls.originalUrl, '/api/attachments/attachment-1/file')

  await removeAttachmentStoredFiles(sourcePath)
  await assert.rejects(stat(sourcePath))
  await assert.rejects(stat(thumbnailPath))
  await assert.rejects(stat(displayPath))

  console.log('material image optimization verification passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
