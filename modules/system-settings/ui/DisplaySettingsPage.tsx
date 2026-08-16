'use client'

import { useCallback, useEffect, useState } from 'react'
import { Columns2, LayoutPanelLeft, MousePointer2, PanelRightOpen, Pin, Rows3 } from 'lucide-react'
import ContrastModeSelector from './ContrastModeSelector'
import {
  useDesktopNavigationPreference,
  useModalGlassPreference,
  useSiblingNavigationPreference,
  useWorkspaceLayoutPreference,
} from '@/app/components/interfacePreferences'
import { applyContrastMode, type ContrastMode } from '@/lib/contrast-modes'
import { loadSystemAppearanceSettings, updateSystemAppearanceSettings } from '../client/system-settings-api'
import SystemSettingsPageShell from './SystemSettingsPageShell'
import TogglePreferenceRow from './TogglePreferenceRow'

const choiceClass = (selected: boolean) => `rounded-lg border p-3 text-left transition ${selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`

export default function DisplaySettingsPage({ onMessage, canUpdate }: { onMessage: (message: string) => void; canUpdate: boolean }) {
  const [modalGlassEnabled, setModalGlassEnabled] = useModalGlassPreference()
  const [navigationPreference, setNavigationPreference] = useDesktopNavigationPreference()
  const [workspaceLayoutPreference, setWorkspaceLayoutPreference] = useWorkspaceLayoutPreference()
  const [siblingNavigationEnabled, setSiblingNavigationEnabled] = useSiblingNavigationPreference()
  const [contrastMode, setContrastMode] = useState<ContrastMode>('standard')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const settings = await loadSystemAppearanceSettings()
      setContrastMode(settings.contrastMode)
      applyContrastMode(settings.contrastMode)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取系统外观设置失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => { void load() }, [load])

  const saveContrastMode = async (nextMode: ContrastMode) => {
    const previousMode = contrastMode
    setContrastMode(nextMode)
    applyContrastMode(nextMode)
    setSaving(true)
    try {
      const settings = await updateSystemAppearanceSettings({ contrastMode: nextMode })
      setContrastMode(settings.contrastMode)
      applyContrastMode(settings.contrastMode)
      onMessage('页面对比度已更新')
    } catch (error) {
      setContrastMode(previousMode)
      applyContrastMode(previousMode)
      onMessage(error instanceof Error ? error.message : '保存页面对比度失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SystemSettingsPageShell resourceKey="displaySettings" title="显示设置" description="维护导航、配色与弹窗等全局界面偏好。">
      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="font-medium text-gray-900">工作区布局</div>
        <div className="mt-1 text-sm text-gray-500">切换整个应用的导航、工具与主内容区域排布；业务页面和数据不会改变。</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            { value: 'sidebar' as const, label: '标准管理', description: '左侧导航与顶部页面工具，适合日常维护和列表操作', icon: LayoutPanelLeft },
            { value: 'canvas' as const, label: '画布工作', description: '顶部导航与右侧页面工具，保留更连贯的主显示区域', icon: PanelRightOpen },
          ]).map((option) => <button key={option.value} type="button" onClick={() => setWorkspaceLayoutPreference({ layout: option.value })} className={choiceClass(workspaceLayoutPreference.layout === option.value)}><span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><option.icon className="h-4 w-4" />{option.label}</span><span className="mt-1 block text-xs text-gray-500">{option.description}</span></button>)}
        </div>
        <div className="mt-2 text-xs text-gray-500">个人工作区偏好，只保存在当前浏览器；也可通过全局布局按钮快速切换。</div>
      </section>

      {workspaceLayoutPreference.layout === 'sidebar' && (
        <section className="mb-4 rounded-lg border border-gray-200 p-4">
          <div className="font-medium text-gray-900">左侧导航行为</div>
          <div className="mt-1 text-sm text-gray-500">标准管理布局下，可让导航持续占位，或在需要时从左侧响应呼出。</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              { value: 'persistent' as const, label: '常驻显示', description: '导航固定显示，主内容始终保留侧栏空间', icon: Pin },
              { value: 'auto-hide' as const, label: '自动隐藏', description: '入口保持不变；点击按钮或悬停页面左侧 30px 呼出', icon: MousePointer2 },
            ]).map((option) => <button key={option.value} type="button" onClick={() => setWorkspaceLayoutPreference({ navigationBehavior: option.value })} className={choiceClass(workspaceLayoutPreference.navigationBehavior === option.value)}><span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><option.icon className="h-4 w-4" />{option.label}</span><span className="mt-1 block text-xs text-gray-500">{option.description}</span></button>)}
          </div>
        </section>
      )}

      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="font-medium text-gray-900">桌面导航布局</div>
        <div className="mt-1 text-sm text-gray-500">仅影响标准管理模式的左侧导航：宽屏可选择单列折叠或固定双列；窄桌面仍自动使用单列。</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            { value: 'accordion' as const, label: '单列折叠', description: '占用空间更少', icon: Rows3 },
            { value: 'split' as const, label: '双列导航', description: '切换一级、二级功能更快', icon: Columns2 },
          ]).map((option) => <button key={option.value} type="button" onClick={() => setNavigationPreference({ mode: option.value })} className={choiceClass(navigationPreference.mode === option.value)}><span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><option.icon className="h-4 w-4" />{option.label}</span><span className="mt-1 block text-xs text-gray-500">{option.description}</span></button>)}
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="font-medium text-gray-900">一级菜单显示</div>
        <div className="mt-1 text-sm text-gray-500">一级菜单保持单行排列，可按识别习惯选择图标与文字组合。</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([
            { value: 'icon' as const, label: '图标' },
            { value: 'icon-label' as const, label: '图标＋文字' },
            { value: 'label' as const, label: '文字' },
          ]).map((option) => <button key={option.value} type="button" onClick={() => setNavigationPreference({ displayMode: option.value })} className={`${choiceClass(navigationPreference.displayMode === option.value)} text-center`}><span className="flex min-h-6 items-center justify-center gap-1.5 text-xs font-semibold text-gray-900">{option.value !== 'label' && <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-700">仪</span>}{option.value !== 'icon' && <span>{option.value === 'label' ? '工作台' : '文字'}</span>}</span><span className="mt-1.5 block text-[11px] text-gray-500">{option.label}</span></button>)}
        </div>
        <div className="mt-2 text-xs text-gray-500">个人显示偏好，只保存在当前浏览器。</div>
      </section>

      <TogglePreferenceRow className="mb-4" title="显示同级菜单按钮" description="在窄屏固定顶部工具条显示同级菜单呼出按钮；菜单默认收起，点击后可在同组页面间切换。" hint="个人显示偏好；菜单名称、顺序和权限仍来自统一菜单配置。" enabled={siblingNavigationEnabled} onChange={setSiblingNavigationEnabled} />

      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="mb-4">
          <div className="font-medium text-gray-900">页面对比度配色</div>
          <div className="mt-1 text-sm text-gray-500">统一调整页面背景、容器层级、边框清晰度、标题、正文和辅助文字的反差；按钮主色与业务状态色保持不变。</div>
          <div className="mt-2 text-xs text-gray-500">系统级设置，保存后对所有客户端生效；当前页面会立即预览。</div>
        </div>
        <ContrastModeSelector value={contrastMode} onChange={saveContrastMode} disabled={loading || saving || !canUpdate} />
      </section>

      <TogglePreferenceRow title="弹窗背景磨砂玻璃" description="开启后弹窗出现时背景会模糊并遮罩；关闭后仅保留半透明遮罩，仍会屏蔽底层按钮响应。" hint="个人显示偏好，只保存在当前浏览器。" enabled={modalGlassEnabled} onChange={setModalGlassEnabled} />
    </SystemSettingsPageShell>
  )
}
