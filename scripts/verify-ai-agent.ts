import { getAiAgentConfig } from '../lib/ai-agent/config'
import { buildAiAgentSystemPrompt } from '../lib/ai-agent/agent'
import { getAvailableAgentToolNames } from '../lib/ai-agent/tools'
import type { PermissionMap } from '../lib/permissions'

const off = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }
const read = { ...off, canRead: true }

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const restrictedPermissions: PermissionMap = {
  aiAssistant: read,
  dashboard: off,
  materials: read,
  stocks: off,
  bomCost: off,
  orders: off,
}
const restrictedTools = getAvailableAgentToolNames(restrictedPermissions)
assert(restrictedTools.includes('get_system_guidance'), '系统使用指导应始终可用')
assert(restrictedTools.includes('search_materials'), '具有物料查看权限时应允许物料查询')
assert(!restrictedTools.includes('query_inventory'), '没有库存查看权限时不得暴露库存查询')
assert(!restrictedTools.includes('query_boms'), '没有 BOM 查看权限时不得暴露 BOM 查询')
assert(!restrictedTools.includes('query_production_orders'), '没有订单查看权限时不得暴露订单查询')

const fullReadPermissions: PermissionMap = {
  ...restrictedPermissions,
  dashboard: read,
  stocks: read,
  bomCost: read,
  orders: read,
}
const allTools = getAvailableAgentToolNames(fullReadPermissions)
assert(allTools.length === 6, `第一版应只有 6 个只读工具，实际为 ${allTools.length}`)
assert(allTools.every((name) => !/(create|update|delete|confirm|adjust)/i.test(name)), '第一版工具名称中不得包含写操作')

const prompt = buildAiAgentSystemPrompt({ key: 'stocks', label: '库存管理' })
assert(prompt.includes('当前 AI 只读，未执行任何操作'), '系统提示必须包含写操作请求的只读声明')
assert(prompt.includes('结论：') && prompt.includes('查询条件：') && prompt.includes('关键数据：'), '系统提示必须包含实时查询回答范式')
assert(prompt.includes('用途：') && prompt.includes('操作步骤：') && prompt.includes('注意事项：'), '系统提示必须包含系统使用回答范式')
assert(prompt.includes('当前页面：库存管理（stocks）'), '系统提示必须带入当前页面上下文')

const originalKey = process.env.AI_AGENT_API_KEY
const originalModel = process.env.AI_AGENT_MODEL
const originalEnabled = process.env.AI_AGENT_ENABLED
try {
  delete process.env.AI_AGENT_API_KEY
  delete process.env.AI_AGENT_MODEL
  process.env.AI_AGENT_ENABLED = 'true'
  assert(!getAiAgentConfig().configured, '缺少密钥和模型时不得标记为已配置')

  process.env.AI_AGENT_API_KEY = 'verification-only'
  process.env.AI_AGENT_MODEL = 'verification-model'
  assert(getAiAgentConfig().configured, '密钥和模型齐全时应标记为已配置')

  process.env.AI_AGENT_ENABLED = 'false'
  assert(!getAiAgentConfig().configured, '明确停用后不得标记为已配置')
} finally {
  if (originalKey === undefined) delete process.env.AI_AGENT_API_KEY
  else process.env.AI_AGENT_API_KEY = originalKey
  if (originalModel === undefined) delete process.env.AI_AGENT_MODEL
  else process.env.AI_AGENT_MODEL = originalModel
  if (originalEnabled === undefined) delete process.env.AI_AGENT_ENABLED
  else process.env.AI_AGENT_ENABLED = originalEnabled
}

console.log('AI Agent 验证通过：配置门槛、只读工具白名单和资源权限过滤符合预期。')
