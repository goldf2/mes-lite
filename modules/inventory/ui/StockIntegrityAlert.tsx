import type { StockIntegrityIssue } from '../contracts/stock'
import { canBackfillStockIssues } from '../model/stock-view'

export default function StockIntegrityAlert({
  message,
  issues,
  canRepair,
  repairing,
  onRepair,
}: {
  message: string
  issues: StockIntegrityIssue[]
  canRepair: boolean
  repairing: boolean
  onRepair: () => void
}) {
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="flex flex-col gap-3">
        <div>
          <div className="font-semibold">{message}</div>
          <div className="mt-1 text-xs text-red-700">库存页已停止展示可能不完整的数据，请先处理以下一致性问题。</div>
        </div>
        {canRepair && canBackfillStockIssues(issues) && (
          <button
            type="button"
            onClick={onRepair}
            disabled={repairing}
            className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-fit"
          >
            {repairing ? '修复中...' : '补齐库存余额'}
          </button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {issues.map((issue, index) => (
          <div key={`${issue.type || index}-${index}`} className="rounded border border-red-100 bg-white/70 p-2">
            <div className="font-medium">{issue.message || issue.type}</div>
            <div className="mt-1 space-y-1 text-xs text-red-700">
              {(issue.records || []).length > 0 ? (issue.records || []).map((record) => (
                <div key={record.id || record.code}>
                  <span className="font-medium">{record.code || record.id}</span>
                  {record.reasons?.length ? `：${record.reasons.join('；')}` : ''}
                </div>
              )) : '无明细'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
