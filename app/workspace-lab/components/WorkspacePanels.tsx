import {
  Bot,
  Boxes,
  ChevronDown,
  ChevronRight,
  Columns2,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspacePanelId } from '../workspaceLab'

export const navigationGroups = [
  { key: 'workspace', label: '工作台', icon: LayoutDashboard, items: ['仪表盘', '所有功能'] },
  { key: 'materials', label: '物料', icon: Boxes, items: ['物料管理', 'BOM 设置', 'BOM 全览'] },
  { key: 'production', label: '生产', icon: Wrench, items: ['生产订单', '流程转移', '派工管理'] },
  { key: 'documents', label: '文档', icon: FileText, items: ['产品文档', '文档分类'] },
  { key: 'inventory', label: '库存', icon: Package, items: ['库存管理', '库位配置'] },
]

const toolTabs: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'properties', label: '属性', icon: SlidersHorizontal },
  { id: 'relations', label: '关联', icon: Columns2 },
  { id: 'attachments', label: '附件', icon: Paperclip },
  { id: 'history', label: '历史', icon: History },
  { id: 'ai', label: 'AI', icon: Bot },
]

export const panelLabels: Record<WorkspacePanelId, string> = {
  navigation: '导航面板',
  tools: '工具面板',
}

export function NavigationContent({
  activeGroup,
  onActiveGroupChange,
  compact = false,
  onNavigate,
}: {
  activeGroup: string
  onActiveGroupChange: (group: string) => void
  compact?: boolean
  onNavigate?: (label: string) => void
}) {
  const active = navigationGroups.find((group) => group.key === activeGroup) || navigationGroups[0]

  if (compact) {
    return (
      <div className="grid min-h-[330px] grid-cols-[150px_minmax(0,1fr)] overflow-hidden">
        <div className="border-r border-slate-200 bg-slate-50 p-2">
          {navigationGroups.map((group) => {
            const Icon = group.icon
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => onActiveGroupChange(group.key)}
                className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  active.key === group.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {group.label}
              </button>
            )
          })}
        </div>
        <div className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{active.label}</div>
          <div className="space-y-1.5">
            {active.items.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => onNavigate?.(item)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                  active.key === 'documents' && index === 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item}
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 p-3">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500 focus-within:border-blue-300 focus-within:bg-white">
          <Search className="h-4 w-4" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="搜索功能" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {navigationGroups.map((group) => {
          const Icon = group.icon
          const expanded = active.key === group.key
          return (
            <div key={group.key} className="mb-1">
              <button
                type="button"
                onClick={() => onActiveGroupChange(group.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  expanded ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{group.label}</span>
                <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {group.items.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onNavigate?.(item)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        group.key === 'documents' && index === 0 ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ToolContent({ activeTool, onActiveToolChange }: { activeTool: string; onActiveToolChange: (tool: string) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 p-2">
        {toolTabs.map((tool) => {
          const Icon = tool.icon
          return (
            <button
              key={tool.id}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onClick={() => onActiveToolChange(tool.id)}
              className={`flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium transition ${
                activeTool === tool.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden 2xl:inline">{tool.label}</span>
            </button>
          )
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTool === 'properties' && (
          <div className="space-y-5">
            <section>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">文档属性</div>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div><div className="text-xs text-slate-400">类别</div><div className="mt-1 font-medium text-slate-800">装配指导书</div></div>
                <div><div className="text-xs text-slate-400">状态</div><div className="mt-1 font-medium text-emerald-700">启用</div></div>
                <div><div className="text-xs text-slate-400">版本</div><div className="mt-1 font-medium text-slate-800">v3</div></div>
              </div>
            </section>
            <button type="button" className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">编辑文档</button>
          </div>
        )}
        {activeTool === 'relations' && (
          <div>
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">关联物料</span><span className="text-xs text-slate-400">2 项</span></div>
            {['主动轴 · MAT-001', '从动齿轮 · MAT-002'].map((item) => (
              <div key={item} className="mb-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">{item}</div>
            ))}
            <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" />添加关联</button>
          </div>
        )}
        {activeTool === 'attachments' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <FileText className="mb-8 h-10 w-10 text-blue-500" />
              <div className="text-sm font-semibold text-slate-800">装配指导书.pdf</div>
              <div className="mt-1 text-xs text-slate-400">PDF · 2.4 MB</div>
            </div>
            <button type="button" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">添加附件</button>
          </div>
        )}
        {activeTool === 'history' && (
          <div className="space-y-4 text-sm">
            {['更新文档资料', '关联主动轴', '上传装配指导书.pdf'].map((item, index) => (
              <div key={item} className="relative border-l-2 border-slate-200 pl-4">
                <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-blue-500" />
                <div className="font-medium text-slate-700">{item}</div>
                <div className="mt-1 text-xs text-slate-400">{index === 0 ? '今天 09:30' : `${index + 1} 天前`}</div>
              </div>
            ))}
          </div>
        )}
        {activeTool === 'ai' && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 p-4 text-white">
              <Sparkles className="mb-8 h-6 w-6" />
              <div className="font-semibold">询问当前页面</div>
              <div className="mt-1 text-xs text-blue-100">仅展示工作区中的只读协作入口。</div>
            </div>
            <button type="button" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">总结这份作业指导书</button>
            <button type="button" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">检查缺少的关联资料</button>
          </div>
        )}
      </div>
    </div>
  )
}
