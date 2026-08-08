import { FileText } from 'lucide-react'

const documentRecords = [
  { id: 'WI-0001', name: '传动组件装配作业指导书', category: '装配指导书', status: '启用', updatedAt: '今天 09:30', materials: 2 },
  { id: 'WI-0002', name: '防护罩折弯与检验规范', category: '加工作业指导书', status: '启用', updatedAt: '昨天 16:20', materials: 1 },
  { id: 'WI-0003', name: '轴套清洗包装要求', category: '包装规范', status: '启用', updatedAt: '8 月 3 日', materials: 2 },
  { id: 'WI-0004', name: '旧版齿轮检测记录模板', category: '检验规范', status: '已归档', updatedAt: '7 月 28 日', materials: 1 },
]

export function WorkspaceMain({
  keyword,
  selectedId,
  onSelectedIdChange,
}: {
  keyword: string
  selectedId: string
  onSelectedIdChange: (id: string) => void
}) {
  const visibleRecords = documentRecords.filter((record) => `${record.id} ${record.name} ${record.category}`.toLowerCase().includes(keyword.trim().toLowerCase()))
  const selected = documentRecords.find((record) => record.id === selectedId) || visibleRecords[0] || documentRecords[0]

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-slate-100 p-3 sm:p-4">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-950">产品文档</h1>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">主显示区域</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">切换工作区布局时，这里的列表、详情和选中状态保持不变。</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            当前选择：{selected.id}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,0.78fr)_minmax(400px,1.22fr)]">
          <section className="min-h-0 overflow-y-auto border-b border-slate-200 p-3 lg:border-b-0 lg:border-r">
            <div className="mb-2 flex items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              <span>文档列表</span>
              <span>{visibleRecords.length} 条</span>
            </div>
            <div className="space-y-2">
              {visibleRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onSelectedIdChange(record.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selected.id === record.id
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{record.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{record.id} · {record.category}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${record.status === '启用' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{record.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                    <span>关联 {record.materials} 个物料</span>
                    <span>{record.updatedAt}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-950">{selected.name}</h2>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{selected.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{selected.id} · {selected.category}</p>
              </div>
              <button type="button" className="shrink-0 whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">编辑</button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-400">文档类别</div>
                <div className="mt-2 font-semibold text-slate-800">{selected.category}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-400">最近更新</div>
                <div className="mt-2 font-semibold text-slate-800">{selected.updatedAt}</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">关联物料</h3>
                <span className="text-xs text-slate-400">{selected.materials} 项</span>
              </div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                {['主动轴 · MAT-001 · Φ25 × 180', '从动齿轮 · MAT-002 · M2 Z40'].slice(0, selected.materials).map((item, index) => (
                  <div key={item} className="flex items-center gap-3 p-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-400">{index + 1}</div>
                    <div className="text-sm font-medium text-slate-700">{item}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">装配作业指导书.pdf</div>
                  <div className="mt-1 text-xs text-slate-400">这里仅展示内容骨架，不接真实附件。</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
