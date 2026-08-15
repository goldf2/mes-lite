import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const maxReleaseTreeBytes = 128 * 1024 * 1024

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean)

const trackedOutputs = trackedFiles.filter((file) => file.startsWith('output/'))
assert.deepEqual(trackedOutputs, [], '生成的 DOCX/PDF/Web 成品不得进入 Git 发布树')

const releaseTreeBytes = trackedFiles.reduce((total, file) => {
  try {
    return total + statSync(path.join(root, file)).size
  } catch {
    return total
  }
}, 0)
assert.ok(
  releaseTreeBytes <= maxReleaseTreeBytes,
  `Git 发布树 ${(releaseTreeBytes / 1024 / 1024).toFixed(1)} MiB 超过 128 MiB 门禁`,
)

const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
const dockerignore = readFileSync(path.join(root, '.dockerignore'), 'utf8')
const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.match(gitignore, /^\/output\/$/m, 'Git 必须忽略本地生成的 output 目录')
assert.match(dockerignore, /^output$/m, 'Docker 构建上下文必须排除 output 目录')
assert.match(workflow, /fetch-depth:\s*2/, 'CI 不得抓取包含历史二进制成品的完整 Git 历史')
assert.match(packageJson.scripts['sop:build:source'] || '', /--markdown-only/, '开发期 SOP 命令必须只生成源文件')
assert.match(packageJson.scripts['verify:sop:artifacts'] || '', /SOP_VERIFY_ARTIFACTS=1/, '最终交付必须保留独立成品校验命令')

console.log(`发布树门禁通过：${trackedFiles.length} 个文件，${(releaseTreeBytes / 1024 / 1024).toFixed(1)} MiB，生成成品未进入 Git/Docker 发布树。`)
