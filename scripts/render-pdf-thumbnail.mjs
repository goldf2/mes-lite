import { spawn } from 'child_process'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const [sourcePath, targetPath, savedRotationValue = '0'] = process.argv.slice(2)
if (!sourcePath || !targetPath) throw new Error('Source and target paths are required')

function normalizeRotation(value) {
  const normalized = ((Number(value) % 360) + 360) % 360
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0
}

function scaledSize(width, height) {
  const scale = Math.min(1, 640 / Math.max(width, 1), 480 / Math.max(height, 1))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

function renderFirstPage(source, outputPrefix) {
  return new Promise((resolve, reject) => {
    const renderer = spawn('pdftoppm', [
      '-f', '1',
      '-l', '1',
      '-singlefile',
      '-png',
      '-scale-to', '640',
      source,
      outputPrefix,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    renderer.stderr.setEncoding('utf8')
    renderer.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000)
    })
    renderer.on('error', reject)
    renderer.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`pdftoppm failed (${signal || code}): ${stderr.trim() || 'no details'}`))
    })
  })
}

await mkdir(path.dirname(targetPath), { recursive: true })
const temporaryPrefix = `${targetPath}.pdf-${randomUUID()}`
const renderedPath = `${temporaryPrefix}.png`
const temporaryPath = `${targetPath}.tmp-${randomUUID()}`
try {
  await renderFirstPage(sourcePath, temporaryPrefix)
  const image = await loadImage(renderedPath)
  const rotation = normalizeRotation(savedRotationValue)
  const swapsDimensions = rotation === 90 || rotation === 270
  const sourceWidth = swapsDimensions ? image.height : image.width
  const sourceHeight = swapsDimensions ? image.width : image.height
  const size = scaledSize(sourceWidth, sourceHeight)
  const canvas = createCanvas(size.width, size.height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.translate(size.width / 2, size.height / 2)
  context.rotate((rotation * Math.PI) / 180)
  const drawWidth = image.width * size.scale
  const drawHeight = image.height * size.scale
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  await writeFile(temporaryPath, await canvas.encode('png'))
  await rename(temporaryPath, targetPath)
} finally {
  await rm(renderedPath, { force: true })
  await rm(temporaryPath, { force: true })
}
