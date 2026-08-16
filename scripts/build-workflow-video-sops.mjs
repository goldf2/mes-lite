import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const sourceDir = join(root, 'docs/operations/user-guide/workflow-videos')
const sopManifest = JSON.parse(readFileSync(join(root, 'sop/manifest.json'), 'utf8'))
const workflowMap = new Map(sopManifest.chapters.flatMap((chapter) => chapter.workflows.map((workflow) => [workflow.id, { ...workflow, chapterId: chapter.id }])))
const chapterIds = new Set(sopManifest.chapters.map((chapter) => chapter.id))
const checkOnly = process.argv.includes('--check')
const requested = process.argv.slice(2).filter((argument) => argument !== '--check')
const sourceFiles = requested.length > 0
  ? requested.map((file) => join(sourceDir, file.endsWith('.json') ? file : `${file}.json`))
  : readdirSync(sourceDir).filter((file) => file.endsWith('.json')).sort().map((file) => join(sourceDir, file))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const ids = new Set()
for (const sourceFile of sourceFiles) {
  assert(existsSync(sourceFile), `视频 SOP 分镜不存在：${sourceFile}`)
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'))
  const label = basename(sourceFile)
  assert(source.id && !ids.has(source.id), `${label} 的 id 缺失或重复`)
  ids.add(source.id)
  assert(source.outputName && !/[\\/:*?"<>|]/.test(source.outputName), `${label} 的 outputName 不合法`)
  assert(/^\d+\.\d+\.\d+$/.test(source.contentVersion), `${label} 缺少合法的 contentVersion`)
  assert(source.title && source.description, `${label} 缺少标题或说明`)
  assert(chapterIds.has(source.chapterId), `${label} 引用不存在的章节 ${source.chapterId}`)
  assert(Array.isArray(source.workflowIds) && source.workflowIds.length >= 2, `${label} 至少关联两个现有 SOP 流程`)
  assert(source.resource, `${label} 缺少读取权限资源`)
  for (const workflowId of source.workflowIds) assert(workflowMap.has(workflowId), `${label} 引用不存在的流程 ${workflowId}`)
  assert(Array.isArray(source.scenes) && source.scenes.length >= 4, `${label} 至少需要四个分镜`)
  for (const [index, scene] of source.scenes.entries()) {
    assert(scene.title && scene.subtitle && scene.narration, `${label} 第 ${index + 1} 个分镜字段不完整`)
    const imagePath = join(root, scene.sourceImage)
    assert(existsSync(imagePath), `${label} 第 ${index + 1} 个分镜截图不存在：${scene.sourceImage}`)
  }
  console.log(`视频 SOP 校验通过：${source.id}，${source.workflowIds.length} 个流程，${source.scenes.length} 个分镜`)
}

if (checkOnly) process.exit(0)

for (const sourceFile of sourceFiles) {
  console.log(`\n开始生成：${relative(root, sourceFile)}`)
  const result = spawnSync('/usr/bin/swift', ['scripts/build-main-interface-tour.swift', relative(root, sourceFile)], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`\n已生成 ${sourceFiles.length} 组常用工作流视频 SOP。`)
