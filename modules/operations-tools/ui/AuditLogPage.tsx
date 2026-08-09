'use client'

import { useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import useCompactViewport from '@/app/components/useCompactViewport'
import { loadAuditLogs } from '../client/maintenance-api'
import type { AuditLogRecord } from '../contracts/maintenance'
import OperationsToolsToolbar from './OperationsToolsToolbar'

export default function AuditLogPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.audit.viewMode', 'list')
  const effectiveViewMode = useCompactViewport(1023) ? 'card' : viewMode
  const auditSort = useClientTableSort(logs, {
    createdAt: (log) => new Date(log.createdAt),
    operator: (log) => log.operatorName,
    action: (log) => log.action,
    entity: (log) => `${log.entityType} ${log.entityLabel || log.entityId || ''}`,
    note: (log) => log.note,
  }, 'createdAt', 'desc')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      setLogs(await loadAuditLogs())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取操作记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // 页面首次挂载时读取审计记录，后续刷新由用户显式触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <OperationsToolsToolbar viewMode={viewMode} onViewModeChange={setViewMode} actions={<AppButton onClick={fetchLogs}>刷新</AppButton>} />
      <div className="mb-6">
        <h3 className="text-lg font-semibold">操作记录</h3>
        <p className="mt-1 text-sm text-gray-500">记录新增、修改、归档、恢复、收货、盘点等关键操作。</p>
      </div>

      {effectiveViewMode === 'card' && logs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {auditSort.sortedRows.map((log) => (
            <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="font-semibold text-gray-900">{log.action}</div><div className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</div></div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div><div className="text-xs text-gray-500">人员</div><div className="mt-1">{log.operatorName || '-'}</div></div>
                <div><div className="text-xs text-gray-500">对象</div><div className="mt-1">{log.entityType} {log.entityLabel || log.entityId || ''}</div></div>
              </div>
              <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">{log.note || '-'}</div>
            </div>
          ))}
        </div>
      ) : logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50"><tr>
              <SortableTableHeader column="createdAt" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>时间</SortableTableHeader>
              <SortableTableHeader column="operator" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>人员</SortableTableHeader>
              <SortableTableHeader column="action" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>动作</SortableTableHeader>
              <SortableTableHeader column="entity" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>对象</SortableTableHeader>
              <SortableTableHeader column="note" activeColumn={auditSort.sortColumn} direction={auditSort.sortDirection} onSort={auditSort.toggleSort}>备注</SortableTableHeader>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {auditSort.sortedRows.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3 text-sm">{log.operatorName || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium">{log.action}</td>
                  <td className="px-4 py-3 text-sm">{log.entityType} {log.entityLabel || log.entityId || ''}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{log.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && logs.length === 0 && <div className="py-12 text-center text-gray-500">暂无操作记录</div>}
    </div>
  )
}
