import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destinationDir = path.join(projectRoot, 'public', 'pdfjs')

await mkdir(destinationDir, { recursive: true })
await Promise.all([
  copyFile(
    path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.mjs'),
    path.join(destinationDir, 'pdf.mjs')
  ),
  copyFile(
    path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
    path.join(destinationDir, 'pdf.worker.min.mjs')
  ),
])

console.log('PDF.js browser modules prepared.')
