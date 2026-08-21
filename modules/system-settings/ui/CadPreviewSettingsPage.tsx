'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { CadPreviewEngine } from '@/lib/cad-preview-engines'
import { loadCadPreviewSettings, updateCadPreviewSettings } from '../client/cad-preview-settings-api'
import type { CadPreviewSettings } from '../contracts/system-settings'
import SystemSettingsPageShell from './SystemSettingsPageShell'

const engineOptions: Array<{ value: CadPreviewEngine; label: string; description: string }> = [
  { value: 'auto', label: '自动选择', description: '按服务端顺序尝试可用引擎；转换失败或结果明显异常时自动切换。' },
  { value: 'libredwg', label: 'LibreDWG', description: '开源原生转换器，速度快；部分新版或复杂 DWG 兼容性有限。' },
  { value: 'acadsharp', label: 'ACadSharp', description: 'MIT 开源 .NET 解析器，作为免费的 DWG 兼容补充。' },
  { value: 'qcad', label: 'QCAD', description: '兼容性较好的可选商业引擎；需在服务器单独安装并配置合法授权。' },
]

const emptySettings: CadPreviewSettings = {
  engine: 'auto',
  service: { configured: false, available: false, autoOrder: [], engines: [] },
}

const engineLabel = (engine: CadPreviewEngine) => engineOptions.find((item) => item.value === engine)?.label || engine

export default function CadPreviewSettingsPage({ onMessage, canUpdate }: { onMessage: (message: string) => void; canUpdate: boolean }) {
  const [settings, setSettings] = useState<CadPreviewSettings>(emptySettings)
  const [selected, setSelected] = useState<CadPreviewEngine>('auto')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadCadPreviewSettings()
      setSettings(next)
      setSelected(next.engine)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取 CAD 预览设置失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const statusByEngine = useMemo(() => new Map(settings.service.engines.map((item) => [item.engine, item])), [settings.service.engines])
  const selectedAvailable = selected === 'auto' || statusByEngine.get(selected)?.available === true
  const autoOrderText = settings.service.autoOrder.length > 0
    ? settings.service.autoOrder.map(engineLabel).join(' → ')
    : '尚未从转换服务读取到可用顺序'

  const save = async () => {
    if (!selectedAvailable) {
      onMessage(`${engineLabel(selected)} 当前不可用，请先完成服务端安装或选择其他引擎`)
      return
    }
    setSaving(true)
    try {
      const next = await updateCadPreviewSettings(selected)
      setSettings(next)
      setSelected(next.engine)
      onMessage(`CAD 预览引擎已切换为${engineLabel(next.engine)}`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存 CAD 预览设置失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SystemSettingsPageShell resourceKey="cadPreviewSettings" title="文件预览" description="选择 DWG/DXF 图纸的转换引擎并检查服务端可用状态。">
      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-medium text-gray-900">CAD 转换服务</div>
            <div className="mt-1 text-sm text-gray-500">PDF、图片和普通附件不受此设置影响；切换后新预览使用独立缓存。</div>
          </div>
          <AppButton size="sm" onClick={() => void load()} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            重新检测
          </AppButton>
        </div>
        <div className={`mt-3 rounded-md px-3 py-2 text-sm ${settings.service.available ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          {settings.service.available ? `服务可用；自动顺序：${autoOrderText}` : settings.service.configured ? '转换服务已配置但当前不可用。' : '主系统尚未配置 CAD_PREVIEW_SERVICE_URL。'}
        </div>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        {engineOptions.map((option) => {
          const status = option.value === 'auto' ? null : statusByEngine.get(option.value)
          const available = option.value === 'auto' || status?.available === true
          const checked = selected === option.value
          return (
            <label key={option.value} className={`rounded-lg border p-4 transition ${checked ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'} ${!available ? 'opacity-70' : 'cursor-pointer'}`}>
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-gray-900">
                  <input type="radio" name="cad-preview-engine" value={option.value} checked={checked} onChange={() => setSelected(option.value)} disabled={loading || !available} />
                  {option.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${available ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {option.value === 'auto' ? '推荐' : available ? '可用' : '未安装'}
                </span>
              </span>
              <span className="mt-2 block text-sm text-gray-600">{option.description}</span>
              {option.value !== 'auto' && <span className="mt-2 block text-xs text-gray-500">{status?.detail || '转换服务未返回该引擎状态'}</span>}
            </label>
          )
        })}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <div className="text-xs text-gray-500">QCAD 为可选外挂能力，系统不会下载、分发或绕过其授权。</div>
        <AppButton variant="primary" onClick={() => void save()} disabled={loading || saving || !canUpdate || selected === settings.engine || !selectedAvailable}>
          {saving ? '保存中…' : '保存引擎设置'}
        </AppButton>
      </div>
    </SystemSettingsPageShell>
  )
}
