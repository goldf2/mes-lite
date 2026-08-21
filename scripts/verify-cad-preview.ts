import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS: process.env.CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS,
  }
  let conversionRequests = 0
  let activeConversions = 0
  let maxObservedConversions = 0
  let invalidResponse = false
  const conversionBodies: Buffer[] = []
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
  const server = createServer((request, response) => {
    if (request.headers.authorization !== 'Bearer verification-token') {
      response.writeHead(401).end('missing token')
      return
    }
    if (request.url === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'ok',
        autoOrder: ['qcad', 'acadsharp', 'libredwg'],
        engines: [
          { engine: 'libredwg', available: true, detail: 'LibreDWG ready' },
          { engine: 'acadsharp', available: true, detail: 'ACadSharp ready' },
          { engine: 'qcad', available: false, detail: 'QCAD not configured' },
        ],
      }))
      return
    }
    if (request.url === '/v1/convert/pdf' && request.method === 'POST') {
      conversionRequests += 1
      const chunks: Buffer[] = []
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      request.once('end', () => {
        conversionBodies.push(Buffer.concat(chunks))
        activeConversions += 1
        maxObservedConversions = Math.max(maxObservedConversions, activeConversions)
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'application/pdf' }).end(invalidResponse ? Buffer.from('not-a-pdf') : pdfBytes)
          activeConversions -= 1
        }, 20)
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
    process.env.CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS = '2'

    const sourcePath = join(verifyRoot, 'drawing.dwg')
    await writeFile(sourcePath, Buffer.from('synthetic-dwg-source'))
    const preview = await import('../lib/files/cad-document-preview')
    const thumbnail = await import('../lib/attachment-thumbnail')
    assert.deepEqual(await preview.checkCadPreviewService(), {
      configured: true,
      available: true,
      autoOrder: ['qcad', 'acadsharp', 'libredwg'],
      engines: [
        { engine: 'libredwg', available: true, detail: 'LibreDWG ready' },
        { engine: 'acadsharp', available: true, detail: 'ACadSharp ready' },
        { engine: 'qcad', available: false, detail: 'QCAD not configured' },
      ],
    })
    assert.equal(preview.cadPreviewVersion, 3)
    assert.match(
      thumbnail.attachmentThumbnailStoragePath(sourcePath, 0, 'cad'),
      /\.thumb-cad-v3-auto-r0\.png$/,
      'CAD 缩略图必须随转换版本和选择的引擎隔离',
    )

    const source = {
      storagePath: sourcePath,
      originalName: 'drawing.dwg',
      mimeType: 'application/vnd.dwg',
    }
    const firstPath = await preview.ensureCadDocumentPreview(source)
    const secondPath = await preview.ensureCadDocumentPreview(source)
    assert.equal(firstPath, secondPath)
    assert.match(firstPath, /\.preview-cad-v3-auto\.pdf$/, '多引擎预览必须使用独立缓存版本')
    assert.deepEqual(await readFile(firstPath), pdfBytes)
    assert.equal(conversionRequests, 1, 'CAD 派生 PDF 必须持久缓存，重复打开不得重复转换')
    assert.match(conversionBodies[0].toString('utf8'), /name="output"/)
    assert.match(conversionBodies[0].toString('utf8'), /name="engine"[\s\S]*auto/)
    assert.match(conversionBodies[0].toString('utf8'), /name="file"; filename="drawing.dwg"/)

    const acadSharpPath = await preview.ensureCadDocumentPreview(source, 'acadsharp')
    assert.match(acadSharpPath, /\.preview-cad-v3-acadsharp\.pdf$/, '显式引擎必须使用自己的派生 PDF 缓存')
    assert.notEqual(acadSharpPath, firstPath)
    assert.match(conversionBodies[1].toString('utf8'), /name="engine"[\s\S]*acadsharp/)

    const thumbnailPath = thumbnail.attachmentThumbnailStoragePath(sourcePath, 0, 'cad')
    await writeFile(thumbnailPath, Buffer.from('cached-thumbnail'))
    await preview.regenerateCadDocumentPreview(source)
    await thumbnail.removeAttachmentThumbnailFiles(source)
    await assert.rejects(access(thumbnailPath), '手动重新生成必须清理该 CAD 附件的缩略图缓存')
    assert.deepEqual(await readFile(firstPath), pdfBytes)
    assert.equal(conversionRequests, 3, '手动重新生成必须绕过已有 PDF 缓存并重新请求转换服务')

    invalidResponse = true
    await assert.rejects(() => preview.regenerateCadDocumentPreview(source), /返回的 PDF 无效/)
    assert.deepEqual(await readFile(firstPath), pdfBytes, '重新转换失败时必须保留上一份有效 CAD PDF')
    invalidResponse = false

    const concurrentSources = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
      const storagePath = join(verifyRoot, `drawing-${index}.dwg`)
      await writeFile(storagePath, Buffer.from(`synthetic-dwg-source-${index}`))
      return { storagePath, originalName: `drawing-${index}.dwg`, mimeType: 'application/vnd.dwg' }
    }))
    const requestsBeforeQueueTest = conversionRequests
    maxObservedConversions = 0
    await Promise.all(concurrentSources.map((item) => preview.ensureCadDocumentPreview(item)))
    assert.equal(conversionRequests, requestsBeforeQueueTest + concurrentSources.length)
    assert.ok(maxObservedConversions <= 2, `CAD 转换请求并发数不得超过 2，实际 ${maxObservedConversions}`)

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
