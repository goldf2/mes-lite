'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, PlugZap, Save, SlidersHorizontal } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import { appInputClassName } from '@/app/components/FormField'
import ModalDialog from '@/app/components/ModalDialog'
import { loadAiAgentConfig, testAiAgentConnection, updateAiAgentConfig } from '../client/ai-agent-settings-api'
import type { AiAgentConfigView } from '../contracts/system-settings'

const providerPresets = [
  { key: 'qwen', label: '通义千问', providerName: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { key: 'deepseek', label: 'DeepSeek', providerName: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { key: 'glm', label: '智谱 GLM', providerName: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
] as const

const initialForm = {
  enabled: true,
  providerName: '通义千问',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: '',
  timeoutMs: 45000,
  maxToolRounds: 4,
}

export default function AiAgentSettingsPanel({ onMessage, canUpdate }: { onMessage: (message: string) => void; canUpdate: boolean }) {
  const [config, setConfig] = useState<AiAgentConfigView | null>(null)
  const [form, setForm] = useState(initialForm)
  const [apiKey, setApiKey] = useState('')
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showMarkLab, setShowMarkLab] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const applyConfig = useCallback((next: AiAgentConfigView) => {
    setConfig(next)
    setForm({
      enabled: next.enabled,
      providerName: next.providerName,
      baseUrl: next.baseUrl,
      model: next.model,
      timeoutMs: next.timeoutMs,
      maxToolRounds: next.maxToolRounds,
    })
    setApiKey('')
    setClearStoredApiKey(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applyConfig(await loadAiAgentConfig())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取 AI 配置失败')
    } finally {
      setLoading(false)
    }
  }, [applyConfig, onMessage])

  useEffect(() => { void load() }, [load])

  const presetKey = providerPresets.find((item) => item.providerName === form.providerName && item.baseUrl === form.baseUrl)?.key || 'custom'

  const save = async () => {
    if (!form.providerName.trim() || !form.baseUrl.trim()) return onMessage('请填写 AI 提供商和接口地址')
    if (form.enabled && !form.model.trim()) return onMessage('启用 AI 助手前请填写模型 ID')
    if (apiKey.trim() && !config?.storageReady) return onMessage('服务器尚未配置 AI_AGENT_CONFIG_SECRET，暂时不能保存页面密钥')
    setSaving(true)
    try {
      applyConfig(await updateAiAgentConfig({ ...form, apiKey: apiKey.trim() || undefined, clearStoredApiKey }))
      onMessage('AI 助手配置已保存')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存 AI 配置失败')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      onMessage(`AI 服务连接正常，响应约 ${await testAiAgentConnection()} ms`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'AI 服务连接测试失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <section className="mt-8 border-t border-gray-200 pt-6" aria-labelledby="ai-agent-settings-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 id="ai-agent-settings-title" className="text-base font-semibold text-gray-900">AI 助手配置</h4>
            <p className="mt-1 text-sm text-gray-500">配置国产 OpenAI 兼容模型。页面配置优先于 Coolify 环境变量。</p>
          </div>
          <div className="flex items-center gap-2">
            {canUpdate && <AppButton variant="secondary" size="sm" onClick={() => setShowMarkLab(true)}><SlidersHorizontal aria-hidden="true" className="h-4 w-4" />图标调参</AppButton>}
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${config?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{loading ? '读取中' : config?.configured ? '已配置' : '未配置'}</span>
          </div>
        </div>

        {!loading && config && (
          <>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>配置来源：{config.source === 'PAGE' ? '系统页面' : '服务器环境变量'}</span><span>密钥：{config.apiKeyHint || '未配置'}</span></div>
            {!config.storageReady && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">要在本页面保存 API Key，请先在 Coolify 设置一次 `AI_AGENT_CONFIG_SECRET`。在此之前仍可使用环境变量密钥并配置其他字段。</div>}
            {config.apiKeyError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">已保存的页面密钥无法解密，请检查 Coolify 中的 `AI_AGENT_CONFIG_SECRET` 是否被修改。</div>}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5 md:col-span-2">
                <span><span className="block text-sm font-medium text-gray-800">启用 AI 助手</span><span className="mt-0.5 block text-xs text-gray-500">停用后保留配置，但所有账号暂时不能调用模型。</span></span>
                <input type="checkbox" checked={form.enabled} disabled={!canUpdate} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </label>
              <label className="text-sm text-gray-700">提供商<select value={presetKey} disabled={!canUpdate} onChange={(event) => { const preset = providerPresets.find((item) => item.key === event.target.value); if (preset) setForm((current) => ({ ...current, providerName: preset.providerName, baseUrl: preset.baseUrl })) }} className={`mt-1 ${appInputClassName}`}>{providerPresets.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}<option value="custom">自定义兼容服务</option></select></label>
              <label className="text-sm text-gray-700">提供商显示名称<input value={form.providerName} disabled={!canUpdate} onChange={(event) => setForm((current) => ({ ...current, providerName: event.target.value }))} className={`mt-1 ${appInputClassName}`} maxLength={50} /></label>
              <label className="text-sm text-gray-700 md:col-span-2">OpenAI 兼容接口地址<input value={form.baseUrl} disabled={!canUpdate} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} className={`mt-1 ${appInputClassName}`} placeholder="https://.../v1" spellCheck={false} /><span className="mt-1 block text-xs text-gray-500">生产环境仅接受 HTTPS，系统会自动拼接 `/chat/completions`。</span></label>
              <label className="text-sm text-gray-700 md:col-span-2">模型 ID<input value={form.model} disabled={!canUpdate} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} className={`mt-1 ${appInputClassName}`} placeholder="填写已开通且支持工具调用的模型 ID" spellCheck={false} /></label>
              <label className="text-sm text-gray-700 md:col-span-2">API Key<span className="relative mt-1 block"><input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} className={`${appInputClassName} pr-11`} placeholder={config.apiKeyConfigured ? '留空则继续使用现有密钥' : '输入新的 API Key'} autoComplete="new-password" disabled={!canUpdate || !config.storageReady} spellCheck={false} /><button type="button" onClick={() => setShowApiKey((current) => !current)} aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'} title={showApiKey ? '隐藏 API Key' : '显示 API Key'} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-40" disabled={!canUpdate || !config.storageReady}>{showApiKey ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}</button></span></label>
              {config.storedApiKeyConfigured && <label className="flex items-center gap-2 text-sm text-gray-600 md:col-span-2"><input type="checkbox" checked={clearStoredApiKey} disabled={!canUpdate} onChange={(event) => setClearStoredApiKey(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />清除页面保存的密钥{config.apiKeySource === 'ENV' ? '（清除后继续使用环境变量密钥）' : ''}</label>}
              <label className="text-sm text-gray-700">请求超时（毫秒）<input type="number" min={5000} max={120000} step={1000} value={form.timeoutMs} disabled={!canUpdate} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))} className={`mt-1 ${appInputClassName}`} /></label>
              <label className="text-sm text-gray-700">最大工具轮次<select value={form.maxToolRounds} disabled={!canUpdate} onChange={(event) => setForm((current) => ({ ...current, maxToolRounds: Number(event.target.value) }))} className={`mt-1 ${appInputClassName}`}>{[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              {canUpdate && <AppButton variant="secondary" onClick={testConnection} disabled={saving || testing || !config.configured}><PlugZap aria-hidden="true" className="h-4 w-4" />{testing ? '测试中' : '测试已保存配置'}</AppButton>}
              {canUpdate && <AppButton variant="primary" onClick={save} disabled={saving || testing}><Save aria-hidden="true" className="h-4 w-4" />{saving ? '保存中' : '保存 AI 配置'}</AppButton>}
            </div>
          </>
        )}
      </section>

      {showMarkLab && <ModalDialog title="AI 助手图标调参" description="“保存”仅保留当前浏览器预设；点击“应用到系统”后，配置将对所有用户生效。" onClose={() => setShowMarkLab(false)} size="wide" panelClassName="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]" bodyClassName="overflow-hidden p-0 sm:p-0"><iframe title="AI 助手图标参数实验室" src="/ai/assistant-mark-lab.html" className="h-full min-h-[640px] w-full border-0" /></ModalDialog>}
    </>
  )
}
