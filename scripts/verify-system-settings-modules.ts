import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const systemPage = read('app/components/SystemPage.tsx')
const moduleIndex = read('modules/system-settings/index.ts')
const sectionPage = read('modules/system-settings/SystemSettingsSectionPage.tsx')
const displayPage = read('modules/system-settings/ui/DisplaySettingsPage.tsx')
const navigationPage = read('modules/system-settings/ui/NavigationSettingsPage.tsx')
const cadPreviewPage = read('modules/system-settings/ui/CadPreviewSettingsPage.tsx')
const aiPage = read('modules/system-settings/ui/AiSettingsPage.tsx')
const aiPanel = read('modules/system-settings/ui/AiAgentSettingsPanel.tsx')
const appearanceClient = read('modules/system-settings/client/system-settings-api.ts')
const aiClient = read('modules/system-settings/client/ai-agent-settings-api.ts')
const cadPreviewClient = read('modules/system-settings/client/cad-preview-settings-api.ts')
const systemSettingsRoute = read('app/api/system/settings/route.ts')

assert.match(systemPage, /from '@\/modules\/system-settings'/, 'SystemPage 必须只通过系统设置模块公开出口接入')
assert.doesNotMatch(systemPage, /function SettingsManager\b|function AiAgentSettings\b/, '系统设置实现不得回流 SystemPage')
assert.ok(systemPage.split('\n').length <= 40, 'SystemPage 必须保持为不超过 40 行的纯领域分派层')
assert.match(moduleIndex, /SystemSettingsSectionPage/, '系统设置模块必须公开统一分区页面')
assert.match(sectionPage, /displaySettings[\s\S]*navigationSettings[\s\S]*cadPreviewSettings[\s\S]*aiSettings/, '系统设置模块必须拥有显示、导航、文件预览和 AI 四个设置分区')

for (const [name, source] of [['显示设置', displayPage], ['导航设置', navigationPage], ['文件预览', cadPreviewPage], ['AI 设置', aiPage]] as const) {
  assert.match(source, /<SystemSettingsPageShell\b/, `${name}必须复用公共设置页壳`)
  assert.doesNotMatch(source, /fetch\(/, `${name} UI 不得直接调用 fetch`)
}

assert.match(displayPage, /useWorkspaceLayoutPreference/, '显示设置必须拥有工作区布局偏好')
assert.match(displayPage, /TogglePreferenceRow/, '显示设置必须复用公共开关行')
assert.match(navigationPage, /WorkspaceNavigationSettings/, '导航设置必须复用统一导航配置器')
assert.match(aiPage, /AiAgentSettingsPanel/, 'AI 设置必须组合独立 AI 连接面板')
assert.doesNotMatch(aiPanel, /fetch\(/, 'AI 连接面板必须通过模块 client 调用 API')
assert.match(appearanceClient, /\/api\/system\/settings/, '系统外观 client 必须封装设置接口')
assert.match(aiClient, /\/api\/ai\/config/, 'AI client 必须封装模型配置接口')
assert.match(cadPreviewClient, /scope=cadPreview/, 'CAD 预览 client 必须封装独立设置范围')
assert.match(cadPreviewPage, /LibreDWG[\s\S]*ACadSharp[\s\S]*QCAD/, '文件预览设置必须提供三个 CAD 引擎及自动模式')
assert.match(systemSettingsRoute, /selectedStatus\?\.available !== true[\s\S]*status: 422/, '设置接口必须拒绝绕过界面选择不可用的 CAD 引擎')

for (const path of [
  'modules/system-settings/ui/DisplaySettingsPage.tsx',
  'modules/system-settings/ui/NavigationSettingsPage.tsx',
  'modules/system-settings/ui/CadPreviewSettingsPage.tsx',
  'modules/system-settings/ui/AiSettingsPage.tsx',
  'modules/system-settings/ui/AiAgentSettingsPanel.tsx',
]) {
  assert.ok(read(path).split('\n').length <= 180, `${path} 超过 180 行，应继续拆分稳定职责`)
}

console.log(`系统设置模块校验通过：显示、导航、文件预览、AI 四个分区均使用公共设置页壳，SystemPage ${systemPage.split('\n').length} 行。`)
