'use client'

import { useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import SortableTableHeader from '@/app/components/SortableTableHeader'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import useClientTableSort from '@/app/components/useClientTableSort'
import useCompactViewport from '@/app/components/useCompactViewport'
import { loadArchivedRecords, purgeArchivedRecord, restoreArchivedRecord } from '../client/maintenance-api'
import type { ArchivedRecord } from '../contracts/maintenance'
import { flattenArchivedRecords } from '../model/archive-records'
import OperationsToolsToolbar from './OperationsToolsToolbar'

export default function ArchiveRecordsPage({ onMessage, canUpdate, canDelete }: { onMessage: (message: string) => void; canUpdate: boolean; canDelete: boolean }) {
  const [records, setRecords] = useState<ArchivedRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [purgingKey, setPurgingKey] = useState('')
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.system.recycle.viewMode', 'list')
  const isCompactViewport = useCompactViewport(1023)
  const effectiveViewMode = isCompactViewport ? 'card' : viewMode
  const recordSort = useClientTableSort(records, {
    type: (record) => record.type,
    label: (record) => record.label,
    deletedAt: (record) => record.deletedAt ? new Date(record.deletedAt) : null,
  }, 'deletedAt', 'desc')

  const fetchRecords = async () => {
    setLoading(true)
    try {
      setRecords(flattenArchivedRecords(await loadArchivedRecords()))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取归档记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    // 页面首次挂载时读取归档记录，后续刷新由用户显式触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const restore = async (record: ArchivedRecord) => {
    try {
      await restoreArchivedRecord(record.model, record.id)
      onMessage('记录已恢复归档')
      await fetchRecords()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '恢复归档失败')
    }
  }

  const purge = async (record: ArchivedRecord) => {
    const confirmation = window.prompt(`永久删除「${record.label}」后不能恢复。若确认继续，请输入“永久删除”：`)
    if (confirmation === null) return
    if (confirmation !== '永久删除') {
      onMessage('输入内容不一致，已取消永久删除')
      return
    }

    const key = `${record.model}-${record.id}`
    setPurgingKey(key)
    try {
      await purgeArchivedRecord(record.model, record.id)
      onMessage('归档记录已永久删除')
      await fetchRecords()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '永久删除失败')
    } finally {
      setPurgingKey('')
    }
  }

  const actionsFor = (record: ArchivedRecord) => (
    <div className="flex flex-wrap gap-2">
      {canUpdate && <AppButton size="sm" onClick={() => restore(record)}>恢复归档</AppButton>}
      {canDelete && <AppButton size="sm" variant="danger" onClick={() => purge(record)} disabled={purgingKey === `${record.model}-${record.id}`}>
        {purgingKey === `${record.model}-${record.id}` ? '删除中...' : '永久删除'}
      </AppButton>}
    </div>
  )

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <OperationsToolsToolbar viewMode={viewMode} onViewModeChange={setViewMode} actions={<AppButton onClick={fetchRecords}>刷新</AppButton>} />
      <div className="mb-6">
        <h3 className="text-lg font-semibold">归档记录</h3>
        <p className="mt-1 text-sm text-gray-500">归档记录可以恢复；没有有效库存和下游业务引用时可永久删除并释放编码，完整红冲且净影响为零的来料历史会一并清理。</p>
      </div>

      {effectiveViewMode === 'card' && records.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recordSort.sortedRows.map((record) => (
            <div key={`${record.model}-${record.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-mono text-sm font-semibold text-blue-700">{record.label}</div><div className="mt-1 text-sm text-gray-500">{record.type}</div></div>
                {actionsFor(record)}
              </div>
              <div className="mt-4 text-xs text-gray-500">归档时间：{record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN') : '-'}</div>
            </div>
          ))}
        </div>
      ) : records.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50"><tr>
              <SortableTableHeader column="type" activeColumn={recordSort.sortColumn} direction={recordSort.sortDirection} onSort={recordSort.toggleSort}>类型</SortableTableHeader>
              <SortableTableHeader column="label" activeColumn={recordSort.sortColumn} direction={recordSort.sortDirection} onSort={recordSort.toggleSort}>编号</SortableTableHeader>
              <SortableTableHeader column="deletedAt" activeColumn={recordSort.sortColumn} direction={recordSort.sortDirection} onSort={recordSort.toggleSort}>归档时间</SortableTableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {recordSort.sortedRows.map((record) => (
                <tr key={`${record.model}-${record.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{record.type}</td>
                  <td className="px-4 py-3 font-mono text-sm text-blue-700">{record.label}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{record.deletedAt ? new Date(record.deletedAt).toLocaleString('zh-CN') : '-'}</td>
                  <td className="px-4 py-3">{actionsFor(record)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && records.length === 0 && <div className="py-12 text-center text-gray-500">暂无归档记录</div>}
    </div>
  )
}
