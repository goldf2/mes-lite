import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const packageLock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const version = packageJson.version
const lockVersions = [packageLock.version, packageLock.packages?.['']?.version]

if (!version || lockVersions.some((lockVersion) => lockVersion !== version)) {
  throw new Error(`版本号不一致：package.json=${version || '缺失'}，package-lock.json=${lockVersions.join('/')}`)
}

const releaseNotePath = path.join(root, 'docs', 'releases', `v${version}.md`)
const releaseNoteExists = await stat(releaseNotePath).then(() => true).catch(() => false)

if (releaseNoteExists) {
  const releaseNote = await readFile(releaseNotePath, 'utf8')
  for (const heading of ['## 更新内容', '## 影响范围', '## 验证结果']) {
    if (!releaseNote.includes(heading)) {
      throw new Error(`版本文档缺少章节：${heading}`)
    }
  }

  const releaseIndex = await readFile(path.join(root, 'docs', 'releases', 'README.md'), 'utf8')
  if (!releaseIndex.includes(`v${version}.md`)) {
    throw new Error(`版本索引尚未登记 v${version}`)
  }

  console.log(`版本 v${version} 的正式发布说明与版本索引验证通过`)
} else {
  const pendingPath = path.join(root, 'docs', 'releases', 'PENDING.md')
  const pendingNotes = await readFile(pendingPath, 'utf8').catch(() => '')
  if (!pendingNotes.includes(`| v${version} |`)) {
    throw new Error(`当前版本既无正式发布说明，也未记录到 docs/releases/PENDING.md：v${version}`)
  }

  console.log(`版本 v${version} 已记录到待整理发布清单`)
}
