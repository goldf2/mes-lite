import DailyProductionBomEntry from './DailyProductionBomEntry'

export default function DailyProductionPage({
  canUpdate,
  canReverse,
  onMessage,
}: {
  canUpdate: boolean
  canReverse: boolean
  onMessage: (message: string) => void
}) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">标准流程</div>
          <div className="mt-1 text-sm leading-6 text-gray-600">来料 → 派工 → 生产实绩 → 检验 → 入库 → 发货</div>
          <div className="mt-1 text-xs text-gray-500">用于人员、设备、作业文件、质量和批次谱系完整追溯。</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-sm font-semibold text-blue-950">快捷流程（当前页）</div>
          <div className="mt-1 text-sm leading-6 text-blue-900">来料形成可用库存 → 快捷生产 / 转换（BOM 可选）→ 可选质检 → 入库</div>
          <div className="mt-1 text-xs text-blue-800">两套流程互不关联；同一批实物只能选择其中一条，避免重复扣料和重复报产。</div>
        </div>
      </section>
      <DailyProductionBomEntry canUpdate={canUpdate} canReverse={canReverse} onMessage={onMessage} />
    </div>
  )
}
