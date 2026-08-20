import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('无法取得 CAD 测试服务端口')
  return address.port
}

async function close(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function main() {
  const verifyRoot = await mkdtemp(join(tmpdir(), 'mes-lite-cad-preview-'))
  const previousEnvironment = {
    MES_LITE_UPLOAD_DIR: process.env.MES_LITE_UPLOAD_DIR,
    CAD_PREVIEW_SERVICE_URL: process.env.CAD_PREVIEW_SERVICE_URL,
    CAD_PREVIEW_SERVICE_TOKEN: process.env.CAD_PREVIEW_SERVICE_TOKEN,
    CAD_PREVIEW_TIMEOUT_MS: process.env.CAD_PREVIEW_TIMEOUT_MS,
  }
  let conversionRequests = 0
  let invalidResponse = false
  const conversionBodies: Buffer[] = []
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
  const server = createServer((request, response) => {
    if (request.headers.authorization !== 'Bearer verification-token') {
      response.writeHead(401).end('missing token')
      return
    }
    if (request.url === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}')
      return
    }
    if (request.url === '/v1/convert/pdf' && request.method === 'POST') {
      conversionRequests += 1
      const chunks: Buffer[] = []
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      request.once('end', () => {
        conversionBodies.push(Buffer.concat(chunks))
        response.writeHead(200, { 'Content-Type': 'application/pdf' }).end(invalidResponse ? Buffer.from('not-a-pdf') : pdfBytes)
      })
      return
    }
    response.writeHead(404).end()
  })

  try {
    const port = await listen(server)
    process.env.MES_LITE_UPLOAD_DIR = verifyRoot
    process.env.CAD_PREVIEW_SERVICE_URL = `http://127.0.0.1:${port}`
    process.env.CAD_PREVIEW_SERVICE_TOKEN = 'verification-token'
    process.env.CAD_PREVIEW_TIMEOUT_MS = '5000'

    const sourcePath = join(verifyRoot, 'drawing.dwg')
    await writeFile(sourcePath, Buffer.from('synthetic-dwg-source'))
    const preview = await import('../lib/files/cad-document-preview')
    const thumbnail = await import('../lib/attachment-thumbnail')
    assert.deepEqual(await preview.checkCadPreviewService(), { configured: true, available: true })
    assert.equal(preview.cadPreviewVersion, 2)
    assert.match(
      thumbnail.attachmentThumbnailStoragePath(sourcePath, 0, 'cad'),
      /\.thumb-cad-v2-r0\.png$/,
      'CAD 缩略图必须随字体回退版本失效',
    )

    const source = {
      storagePath: sourcePath,
      originalName: 'drawing.dwg',
      mimeType: 'application/vnd.dwg',
    }
    const firstPath = await preview.ensureCadDocumentPreview(source)
    const secondPath = await preview.ensureCadDocumentPreview(source)
    assert.equal(firstPath, secondPath)
    assert.match(firstPath, /\.preview-cad-v2\.pdf$/, '字体回退变更必须使用新缓存版本重新生成 CAD 预览')
    assert.deepEqual(await readFile(firstPath), pdfBytes)
    assert.equal(conversionRequests, 1, 'CAD 派生 PDF 必须持久缓存，重复打开不得重复转换')
    assert.match(conversionBodies[0].toString('utf8'), /name="output"/)
    assert.match(conversionBodies[0].toString('utf8'), /name="file"; filename="drawing.dwg"/)

    const invalidPath = join(verifyRoot, 'invalid.dxf')
    await writeFile(invalidPath, Buffer.from('synthetic-dxf-source'))
    invalidResponse = true
    await assert.rejects(
      () => preview.ensureCadDocumentPreview({
        storagePath: invalidPath,
        originalName: 'invalid.dxf',
        mimeType: 'application/vnd.dxf',
      }),
      /返回的 PDF 无效/,
      '转换服务返回的非 PDF 内容不得写入派生缓存',
    )

    await assert.rejects(
      () => preview.ensureCadDocumentPreview({
        ...source,
        storagePath: join(verifyRoot, 'drawing.txt'),
        originalName: 'drawing.txt',
        mimeType: 'text/plain',
      }),
      /不是可转换的 DWG\/DXF/,
      '非 CAD 文件不得送入转换服务',
    )
  } finally {
    await close(server)
    await rm(verifyRoot, { recursive: true, force: true })
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

void main().then(() => console.log('CAD preview verification passed'))
