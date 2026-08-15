import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSopDownloads } from '../modules/sop/domain/sop-downloads'
import { prepareSopRelease } from './prepare-sop-release.mjs'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'mes-lite-sop-release-'))
  try {
    const pdfPath = join(root, 'source.pdf')
    const docxPath = join(root, 'source.docx')
    const outputDirectory = join(root, 'release')
    await Promise.all([
      writeFile(pdfPath, Buffer.from('%PDF-1.4\nMES-lite fixture\n')),
      writeFile(docxPath, Buffer.from('PK\u0003\u0004MES-lite fixture')),
    ])
    const result = await prepareSopRelease({
      version: '1.2.3', pdfPath, docxPath, outputDirectory, generatedAt: '2026-08-15T00:00:00.000Z',
    })
    assert.equal(result.manifest.schemaVersion, 1)
    assert.equal(result.manifest.version, '1.2.3')
    assert.deepEqual(result.manifest.files.map((file) => file.format), ['PDF', 'DOCX'])
    assert.match(result.manifest.files[0].sha256, /^[a-f0-9]{64}$/)
    assert.equal(JSON.parse(await readFile(result.latestManifestPath, 'utf8')).version, '1.2.3')
    for (const file of result.manifest.files) {
      assert.equal((await readFile(join(outputDirectory, file.objectPath))).length, file.size)
    }

    const downloads = buildSopDownloads('1.2.3', 'https://downloads.example.com/mes-lite/sop/', 'production')
    assert.deepEqual(downloads.map((item) => item.format), ['PDF', 'DOCX'])
    assert.match(downloads[0].url, /^https:\/\/downloads\.example\.com\/mes-lite\/sop\/v1\.2\.3\//)
    assert.match(downloads[0].url, /\.pdf$/)
    assert.equal(buildSopDownloads('1.2.3', undefined, 'production').length, 0)
    assert.equal(buildSopDownloads('1.2.3', 'http://downloads.example.com/sop', 'production').length, 0)
    assert.equal(buildSopDownloads('1.2.3', 'https://user:secret@downloads.example.com/sop', 'production').length, 0)
    assert.equal(buildSopDownloads('not-a-version', 'https://downloads.example.com/sop', 'production').length, 0)
    assert.equal(buildSopDownloads('1.2.3', 'http://127.0.0.1:9000/sop', 'development').length, 2)

    process.env.SOP_PUBLIC_BASE_URL = 'https://downloads.example.com/mes-lite/sop'
    const { getReadableSopCatalog } = await import('../modules/sop/server/sop-catalog')
    const catalog = await getReadableSopCatalog({ role: 'ADMIN' })
    assert.equal(catalog.downloads?.length, 2)
    assert.ok(catalog.downloads?.every((item) => item.url.includes(`/v${catalog.version}/`)), 'API 目录必须返回当前应用精确版本')
  } finally {
    delete process.env.SOP_PUBLIC_BASE_URL
    await rm(root, { recursive: true, force: true })
  }
}

main()
  .then(() => console.log('SOP 单 OSS 发布验证通过：版本目录、latest 清单、SHA-256 与安全下载地址符合约定。'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
