import {
  defaultAiAssistantMarkConfig,
  normalizeAiAssistantMarkConfig,
  renderAiAssistantMarkSvg,
} from '../lib/ai-assistant-mark'
import { getSystemSettings, updateSystemSettings } from '../lib/system-settings'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const normalized = normalizeAiAssistantMarkConfig({
  petalCount: 100,
  petalRadius: -1,
  petalColors: ['#123456', '<script>alert(1)</script>'],
  centerColor: 'not-a-color',
  rotationEnabled: false,
})

assert(normalized.petalCount === 16, '叶片数量应限制为 16')
assert(normalized.petalRadius === 10, '叶片半径应限制为最小值 10')
assert(normalized.petalColors[0] === '#123456', '合法颜色应保留')
assert(normalized.petalColors[1] === defaultAiAssistantMarkConfig.petalColors[1], '非法颜色应回退到默认值')
assert(normalized.centerColor === defaultAiAssistantMarkConfig.centerColor, '中心非法颜色应回退到默认值')
assert(!normalized.rotationEnabled, '布尔型动态配置应被保留')

const svg = renderAiAssistantMarkSvg(normalized, 'verification-mark')
assert(svg.startsWith('<svg'), '应输出 SVG 根节点')
assert(svg.includes('verification-mark-center-gradient'), '所有渐变 ID 应使用独立前缀')
assert(!svg.toLowerCase().includes('<script'), '输出 SVG 不得包含脚本')
assert(!svg.includes('alert(1)'), '输出 SVG 不得包含未信任的颜色输入')

async function verifyLoadingIndicatorSetting() {
  type SettingsClient = NonNullable<Parameters<typeof getSystemSettings>[0]>
  const values = new Map<string, string>()
  const client = {
    systemSetting: {
      findMany: async () => Array.from(values, ([key, value]) => ({ key, value })),
      upsert: async ({ create, update, where }: {
        create: { key: string; value: string }
        update: { value: string }
        where: { key: string }
      }) => {
        values.set(where.key, values.has(where.key) ? update.value : create.value)
        return { key: where.key, value: values.get(where.key) }
      },
    },
  } as unknown as SettingsClient

  assert((await getSystemSettings(client)).aiLoadingIndicatorEnabled, '页面加载图标应默认开启')
  await updateSystemSettings({ aiLoadingIndicatorEnabled: false }, client)
  assert(!(await getSystemSettings(client)).aiLoadingIndicatorEnabled, '关闭状态应持久化')
}

verifyLoadingIndicatorSetting()
  .then(() => console.log('AI 助手图标验证通过：参数边界、可信 SVG 渲染与加载图标系统开关符合预期。'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
