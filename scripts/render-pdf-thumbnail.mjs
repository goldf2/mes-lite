import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'

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

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const loadingTask = pdfjs.getDocument({
  data: new Uint8Array(await readFile(sourcePath)),
  useSystemFonts: true,
})

try {
  const document = await loadingTask.promise
  if (document.numPages < 1) throw new Error('PDF has no previewable pages')
  const page = await document.getPage(1)
  const rotation = normalizeRotation(Number(page.rotate || 0) + Number(savedRotationValue || 0))
  const baseViewport = page.getViewport({ scale: 1, rotation })
  const size = scaledSize(baseViewport.width, baseViewport.height)
  const viewport = page.getViewport({ scale: size.scale, rotation })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    background: '#ffffff',
  }).promise
  page.cleanup()

  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${randomUUID()}`
  await writeFile(temporaryPath, await canvas.encode('png'))
  await rename(temporaryPath, targetPath)
} finally {
  await loadingTask.destroy()
}
