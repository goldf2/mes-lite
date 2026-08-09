'use client'

import { useCallback, useEffect, useState } from 'react'
import { executeDataIntegrityAction, loadDataIntegrityReport } from '../client/maintenance-api'

type IntegrityAction = {
  key: string
  label: string
  destructive: boolean
}

type IntegrityIssue = {
  id: string
  type: string
  severity: 'BLOCKING' | 'WARNING' | 'INFO'
  title: string
  detail: string
  entityType: string
  entityId: string
  entityLabel: string
  currentValue?: string | null
  expectedValue?: string | null
  actions: IntegrityAction[]
}

type IntegrityReport = {
  checkedAt: string
  summary: {
    total: number
    blocking: number
    warning: number
    info: number
    repairable: number
    deletable: number
  }
  issues: IntegrityIssue[]
}

type PendingAction = {
  issue: IntegrityIssue
  action: IntegrityAction
}

const severityStyles = {
  BLOCKING: {
    label: '阻塞',
    badge: 'bg-red-100 text-red-700',
    border: 'border-red-200',
  },
  WARNING: {
    label: '警告',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
  },
  INFO: {
    label: '提示',
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-200',
  },
}

export default function DataIntegrityPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [executingIssueId, setExecutingIssueId] = useState<string | null>(null)

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await loadDataIntegrityReport<IntegrityReport>() || null)
      setPendingAction(null)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '数据关系检查失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const executeAction = async () => {
    if (!pendingAction) return
    const { issue, action } = pendingAction
    setExecutingIssueId(issue.id)
    try {
      const message = await executeDataIntegrityAction({
          issueId: issue.id,
          action: action.key,
          confirmation: action.destructive ? 'DELETE_ERROR_DATA' : undefined,
      })
      onMessage(message || '数据关系处理完成')
      await loadReport()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '数据关系处理失败')
    } finally {
      setExecutingIssueId(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="font-medium text-gray-900">数据维护与关系检查</div>
          <div className="mt-1 text-sm text-gray-500">检查库存归属、物料、BOM、生产耗用和库存成本层之间的关键关系。</div>
          <div className="mt-2 text-xs text-gray-500">零余额、无库位、无流水的孤立库存可安全清理；涉及有效库存、成本或流水的问题仅提示人工处理。</div>
        </div>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading || Boolean(executingIssueId)}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '检查中...' : '重新检查'}
        </button>
      </div>

      {loading && !report ? (
        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">正在检查数据关系...</div>
      ) : report ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">问题总数</div>
              <div className="mt-1 text-xl font-semibold">{report.summary.total}</div>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <div className="text-xs text-red-600">阻塞问题</div>
              <div className="mt-1 text-xl font-semibold text-red-800">{report.summary.blocking}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-xs text-amber-600">警告</div>
              <div className="mt-1 text-xl font-semibold text-amber-800">{report.summary.warning}</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="text-xs text-blue-600">可安全修复</div>
              <div className="mt-1 text-xl font-semibold text-blue-800">{report.summary.repairable}</div>
            </div>
            <div className="rounded-lg bg-rose-50 p-3">
              <div className="text-xs text-rose-600">可安全清理</div>
              <div className="mt-1 text-xl font-semibold text-rose-800">{report.summary.deletable}</div>
            </div>
          </div>

          {report.issues.length === 0 ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              当前未发现关键数据关系问题。
            </div>
          ) : (
            <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {report.issues.map((issue) => {
                const style = severityStyles[issue.severity]
                const confirming = pendingAction?.issue.id === issue.id
                return (
                  <div key={issue.id} className={`rounded-lg border ${style.border} bg-white p-3`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.badge}`}>{style.label}</span>
                          <span className="font-medium text-gray-900">{issue.title}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700">{issue.entityLabel}</div>
                        <div className="mt-1 text-xs leading-5 text-gray-500">{issue.detail}</div>
                      </div>
                      {issue.actions.length > 0 && !confirming && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {issue.actions.map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              onClick={() => setPendingAction({ issue, action })}
                              disabled={Boolean(executingIssueId)}
                              className={`rounded border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                                action.destructive
                                  ? 'border-red-300 text-red-700 hover:bg-red-50'
                                  : 'border-blue-300 text-blue-700 hover:bg-blue-50'
                              }`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {confirming && pendingAction && (
                      <div className={`mt-3 rounded-lg border p-3 text-sm ${
                        pendingAction.action.destructive
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-blue-200 bg-blue-50 text-blue-800'
                      }`}>
                        <div>
                          {pendingAction.action.destructive
                            ? pendingAction.action.key === 'DELETE_ORPHAN_STOCK'
                              ? '确认永久清理这条孤立库存记录？系统将在同一事务内重新确认余额为零且没有库位或库存流水；条件变化时会自动停止。'
                              : '确认永久删除这条错误 BOM 明细？该操作不能恢复，但不会删除物料、库存流水或生产历史。'
                            : '确认执行此修复？系统只修改关系或单位标签，不换算任何数量和金额。'}
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingAction(null)}
                            disabled={Boolean(executingIssueId)}
                            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={executeAction}
                            disabled={Boolean(executingIssueId)}
                            className={`rounded px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                              pendingAction.action.destructive ? 'bg-red-600' : 'bg-blue-600'
                            }`}
                          >
                            {executingIssueId ? '处理中...' : '确认执行'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-3 text-right text-xs text-gray-400">
            检查时间：{new Date(report.checkedAt).toLocaleString('zh-CN')}
          </div>
        </>
      ) : null}
    </div>
  )
}
