import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { attachmentPreviewKind, isSpreadsheetAttachment } from './attachment-file-types'
import { resolveAttachmentStoragePath } from './attachment-storage'

type OfficePreviewSource = {
  storagePath: string
  originalName?: string | null
  mimeType: string
}

const previewVersion = 2
const conversionTasks = new Map<string, Promise<string>>()

export function officePreviewConversionFormat(fileName: string, mimeType: string) {
  if (!isSpreadsheetAttachment(fileName, mimeType)) return 'pdf'
  return 'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}'
}

export function officePreviewStoragePath(storagePath: string) {
  return `${resolveAttachmentStoragePath(storagePath)}.preview-v${previewVersion}.pdf`
}

async function convertOfficeDocument(source: OfficePreviewSource, targetPath: string) {
  const sourcePath = resolveAttachmentStoragePath(source.storagePath)
  if (attachmentPreviewKind(source.originalName || sourcePath, source.mimeType) !== 'office') {
    throw new Error('该附件不是可转换的 Office 文档')
  }
  const conversionFormat = officePreviewConversionFormat(
    source.originalName || sourcePath,
    source.mimeType
  )

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-office-'))
  const outputDirectory = path.join(temporaryRoot, 'output')
  const profileDirectory = path.join(temporaryRoot, 'profile')
  await Promise.all([mkdir(outputDirectory), mkdir(profileDirectory)])

  try {
    await new Promise<void>((resolve, reject) => {
      const worker = spawn('soffice', [
        '--headless',
        '--nologo',
        '--nodefault',
        '--nolockcheck',
        '--nofirststartwizard',
        `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
        '--convert-to',
        conversionFormat,
        '--outdir',
        outputDirectory,
        sourcePath,
      ], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      worker.stderr.setEncoding('utf8')
      worker.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-4000)
      })
      const timeout = setTimeout(() => worker.kill('SIGKILL'), 60_000)
      worker.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      worker.on('exit', (code, signal) => {
        clearTimeout(timeout)
        if (code === 0) resolve()
        else reject(new Error(`Office 预览转换失败 (${signal || code}): ${stderr.trim() || 'no details'}`))
      })
    })

    const convertedPath = path.join(outputDirectory, `${path.parse(sourcePath).name}.pdf`)
    const converted = await readFile(convertedPath)
    if (converted.length === 0) throw new Error('Office 预览转换结果为空')
    await mkdir(path.dirname(targetPath), { recursive: true })
    const temporaryTarget = `${targetPath}.tmp-${randomUUID()}`
    await writeFile(temporaryTarget, converted)
    await rename(temporaryTarget, targetPath)
    return targetPath
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function ensureOfficeDocumentPreview(source: OfficePreviewSource) {
  const targetPath = officePreviewStoragePath(source.storagePath)
  try {
    await access(targetPath)
    return targetPath
  } catch {
    // 首次查看时转换并缓存，后续直接复用。
  }

  const running = conversionTasks.get(targetPath)
  if (running) return running
  const task = convertOfficeDocument(source, targetPath)
    .finally(() => conversionTasks.delete(targetPath))
  conversionTasks.set(targetPath, task)
  return task
}
