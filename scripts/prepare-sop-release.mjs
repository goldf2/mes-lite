import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')

function fileName(version, extension) {
  return `MES-lite全流程作业指导书-v${version}.${extension}`
}

async function artifact(sourcePath, format, objectPath) {
  const [content, fileStat] = await Promise.all([readFile(sourcePath), stat(sourcePath)])
  if (!fileStat.isFile() || fileStat.size === 0) throw new Error(`SOP ${format} 成品为空：${sourcePath}`)
  return {
    format,
    fileName: path.basename(sourcePath),
    objectPath,
    size: fileStat.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}

export async function prepareSopRelease({
  version,
  pdfPath,
  docxPath,
  outputDirectory,
  generatedAt = new Date().toISOString(),
}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`SOP 版本号无效：${version}`)
  const versionDirectoryName = `v${version}`
  const versionDirectory = path.join(outputDirectory, versionDirectoryName)
  const latestDirectory = path.join(outputDirectory, 'latest')
  await Promise.all([mkdir(versionDirectory, { recursive: true }), mkdir(latestDirectory, { recursive: true })])

  const sources = [
    { format: 'PDF', sourcePath: pdfPath, destinationName: fileName(version, 'pdf') },
    { format: 'DOCX', sourcePath: docxPath, destinationName: fileName(version, 'docx') },
  ]
  const files = []
  for (const source of sources) {
    const destination = path.join(versionDirectory, source.destinationName)
    await copyFile(source.sourcePath, destination)
    files.push(await artifact(destination, source.format, `${versionDirectoryName}/${source.destinationName}`))
  }

  const manifest = {
    schemaVersion: 1,
    product: 'MES-lite',
    version,
    generatedAt,
    files,
  }
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`
  await Promise.all([
    writeFile(path.join(versionDirectory, 'manifest.json'), serialized),
    writeFile(path.join(latestDirectory, 'manifest.json'), serialized),
  ])
  return { manifest, versionDirectory, latestManifestPath: path.join(latestDirectory, 'manifest.json') }
}

function valueAfter(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function main() {
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
  const version = valueAfter(process.argv, '--version') || packageJson.version
  const stem = `MES-lite全流程作业指导书-v${version}`
  const result = await prepareSopRelease({
    version,
    pdfPath: path.resolve(valueAfter(process.argv, '--pdf') || path.join(projectRoot, 'output/pdf', `${stem}.pdf`)),
    docxPath: path.resolve(valueAfter(process.argv, '--docx') || path.join(projectRoot, 'output/docx', `${stem}.docx`)),
    outputDirectory: path.resolve(valueAfter(process.argv, '--output') || path.join(projectRoot, 'output/sop-release')),
  })
  console.log(`SOP OSS 发布目录已准备：${result.versionDirectory}`)
  console.log(`最新版本清单：${result.latestManifestPath}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
