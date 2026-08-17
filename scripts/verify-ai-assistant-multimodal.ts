import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const panel = readFileSync(
  join(root, 'app/components/AiAssistantPanel.tsx'),
  'utf8',
)
const client = readFileSync(
  join(root, 'modules/system-settings/client/ai-assistant-api.ts'),
  'utf8',
)
const route = readFileSync(
  join(root, 'app/api/ai/image-recognition/route.ts'),
  'utf8',
)
const spec = readFileSync(join(root, 'docs/ai-agent/MES-Agent规范.md'), 'utf8')

assert.match(
  panel,
  /SpeechRecognition|webkitSpeechRecognition/,
  'AI 助手面板应接入浏览器语音输入能力',
)
assert.match(
  panel,
  /recognizeAiAssistantImage/,
  'AI 助手面板应通过客户端 API 调用图片识别',
)
assert.match(
  panel,
  /accept="image\/png,image\/jpeg,image\/webp"/,
  '图片上传入口必须限制常见图片类型',
)
assert.doesNotMatch(
  panel,
  /AI_AGENT_API_KEY|Authorization:\s*`Bearer/,
  '前端不得出现 AI 服务密钥或鉴权头',
)

assert.match(
  client,
  /\/api\/ai\/image-recognition/,
  '图片识别客户端 API 必须走服务端路由',
)

assert.match(
  route,
  /hasResourcePermission\(operator, ["']aiAssistant["'], ["']read["']\)/,
  '图片识别接口必须继承 AI 助手读取权限',
)
assert.match(route, /getAiAgentConfig/, '图片识别接口必须复用统一 AI 服务配置')
assert.match(route, /image_url/, '图片识别接口必须使用视觉模型图片输入')
assert.match(
  route,
  /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/,
  '图片识别接口必须限制图片大小',
)
assert.match(
  route,
  /未记录图片内容和识别正文/,
  '图片识别审计不得记录图片内容和识别正文',
)
assert.doesNotMatch(
  route,
  /prisma\.(?!systemSetting)/,
  '图片识别路由不得直接读取业务数据',
)

assert.match(
  spec,
  /语音输入由浏览器能力完成，服务端不接收原始音频。/,
  'AI Agent 规范必须说明语音隐私边界',
)
assert.match(
  spec,
  /全局 AI 面板的图片识别只用于问答前的图片摘要/,
  'AI Agent 规范必须区分全局图片识别和单据回填',
)

console.log(
  'AI 助手多模态验证通过：语音输入、图片识别、权限、密钥和审计边界符合预期。',
)
