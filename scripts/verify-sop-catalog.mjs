import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const catalog = JSON.parse(readFileSync(join(root, 'sop/manifest.json'), 'utf8'))
const impact = JSON.parse(readFileSync(join(root, 'sop/change-impact.json'), 'utf8'))
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const registrySource = readFileSync(join(root, 'lib/page-registry.ts'), 'utf8')
const permissionsSource = readFileSync(join(root, 'lib/permissions.ts'), 'utf8')
const workflows = catalog.chapters.flatMap((chapter) => chapter.workflows)
const guideStem = `MES-lite全流程作业指导书-v${packageJson.version}`
const verifyGeneratedArtifacts = process.env.SOP_VERIFY_ARTIFACTS === '1'

assert.equal(catalog.schemaVersion, 1, 'SOP 清单版本必须为 1')
assert.ok(catalog.chapters.length > 0, 'SOP 至少包含一个章节')
assert.ok(workflows.length >= 138, 'SOP 不得丢失既有 138 个流程')
assert.equal(new Set(workflows.map((workflow) => workflow.id)).size, workflows.length, 'SOP 流程 ID 不得重复')
assert.equal(impact.version, packageJson.version, 'SOP 影响声明必须与 package.json 版本一致')
assert.ok(['none', 'updated'].includes(impact.impact), 'SOP 影响只能为 none 或 updated')
assert.ok(String(impact.summary || '').trim(), 'SOP 影响声明必须说明原因')

for (const workflow of workflows) {
  assert.ok(workflow.id && workflow.title && workflow.objective && workflow.result, `流程字段不完整：${workflow.id || '未知'}`)
  assert.ok(Array.isArray(workflow.steps) && workflow.steps.length > 0, `流程缺少操作步骤：${workflow.id}`)
  assert.ok(Array.isArray(workflow.roles) && workflow.roles.length > 0, `流程缺少适用岗位：${workflow.id}`)
  assert.match(registrySource, new RegExp(`key: ['"]${workflow.pageKey}['"]`), `流程页面未注册：${workflow.id} -> ${workflow.pageKey}`)
  assert.match(permissionsSource, new RegExp(`key: ['"]${workflow.resource}['"]`), `流程权限资源不存在：${workflow.id} -> ${workflow.resource}`)
  const screenshot = join(root, 'docs/operations/user-guide/screenshots', `v${workflow.screenshot.baseline}`, workflow.screenshot.file)
  assert.ok(existsSync(screenshot), `流程截图不存在：${workflow.id} -> ${screenshot}`)
}

if (impact.impact === 'updated') {
  assert.ok(Array.isArray(impact.workflowIds) && impact.workflowIds.length > 0, 'SOP 有变化时必须列出受影响流程')
  for (const workflowId of impact.workflowIds) {
    const workflow = workflows.find((candidate) => candidate.id === workflowId)
    assert.ok(workflow, `影响声明引用不存在的流程：${workflowId}`)
    assert.equal(workflow.lastVerifiedVersion, packageJson.version, `受影响流程尚未在当前版本复核：${workflowId}`)
  }
}

const requiredPageKeys = Array.from(registrySource.matchAll(/registerPage\(\{ key: '([^']+)'[^\n]*primaryNavigation: true/g), (match) => match[1])
  .filter((pageKey) => pageKey !== 'helpCenter')
const coveredPageKeys = new Set(workflows.map((workflow) => workflow.pageKey))
const missingCoverage = requiredPageKeys.filter((pageKey) => !coveredPageKeys.has(pageKey))
assert.deepEqual(missingCoverage, [], `一级业务页面缺少 SOP：${missingCoverage.join(', ')}`)

const markdownPath = join(root, 'docs/operations/user-guide', `${guideStem}.md`)
const webPath = join(root, 'output/web', guideStem, 'index.html')
const docxPath = join(root, 'output/docx', `${guideStem}.docx`)
const pdfPath = join(root, 'output/pdf', `${guideStem}.pdf`)
for (const artifactPath of [markdownPath]) {
  assert.ok(existsSync(artifactPath), `当前版本 SOP 产物不存在：${artifactPath}`)
}

const markdown = readFileSync(markdownPath, 'utf8')
assert.match(markdown, new RegExp(`交付版本：v${packageJson.version.replaceAll('.', '\\.')}`), 'Markdown SOP 版本不是当前版本')
assert.equal((markdown.match(/^### /gm) || []).length, workflows.length, 'Markdown SOP 流程数量与清单不一致')
if (verifyGeneratedArtifacts) {
  for (const artifactPath of [webPath, docxPath, pdfPath]) {
    assert.ok(existsSync(artifactPath), `当前版本 SOP 成品不存在：${artifactPath}`)
  }
  const web = readFileSync(webPath, 'utf8')
  assert.match(web, new RegExp(`交付版本：v${packageJson.version.replaceAll('.', '\\.')}`), 'Web SOP 版本不是当前版本')
  assert.equal((web.match(/<article class="workflow"/g) || []).length, workflows.length, 'Web SOP 流程数量与清单不一致')
}

console.log(`SOP 清单校验通过：${catalog.chapters.length} 章、${workflows.length} 个流程、${coveredPageKeys.size} 个页面；版本 v${packageJson.version} 影响=${impact.impact}；成品校验=${verifyGeneratedArtifacts ? '开启' : '按最终交付执行'}。`)

if (process.env.SOP_DIFF_BASE) {
  let changedFiles = []
  try {
    changedFiles = execFileSync('git', ['diff', '--name-only', `${process.env.SOP_DIFF_BASE}...HEAD`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  } catch (error) {
    throw new Error(`无法读取 SOP 影响差异基线 ${process.env.SOP_DIFF_BASE}：${error instanceof Error ? error.message : error}`)
  }
  const productCodeChanged = changedFiles.some((file) => /^(app|lib|modules|prisma)\//.test(file))
  const impactDeclarationChanged = changedFiles.includes('sop/change-impact.json')
  if (productCodeChanged && !impactDeclarationChanged) {
    throw new Error('业务代码已变化，但 sop/change-impact.json 未同步更新')
  }
  console.log(`SOP 差异门禁通过：${changedFiles.length} 个变更文件，业务代码变化=${productCodeChanged}。`)
}
