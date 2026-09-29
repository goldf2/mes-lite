'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResourceSearchCondition } from '@/lib/resource-search'
import { exportMaterialInRecords, listMaterialInRecords } from '../client/material-in-api'
import type { MaterialInHistorySummary, MaterialInPagination, MaterialInRecord } from '../contracts/material-in'
import type { ReceiptHistoryFilter } from './MaterialInHistoryPanel'

export default function useMaterialInHistory(keyword: string, searchConditions: ResourceSearchCondition[]) {
  const [materialIns, setMaterialIns] = useState<MaterialInRecord[]>([])
  const [history, setHistory] = useState<ReceiptHistoryFilter>({ startDate: '', endDate: '', includeArchived: false })
  const [summary, setSummary] = useState<MaterialInHistorySummary[]>([])
  const [pagination, setPagination] = useState<MaterialInPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [historyError, setHistoryError] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const requestId = useRef(0)

  const queryParams = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20', includeSummary: 'true', startDate: history.startDate, endDate: history.endDate, includeArchived: String(history.includeArchived) })
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (searchConditions.length > 0) params.set('advanced', JSON.stringify(searchConditions.map(({ field, operator, value }) => ({ field, operator, value }))))
    return params
  }, [keyword, searchConditions, history, page])

  const exportHistory = async () => {
    if (exporting) return
    setExporting(true)
    setExportError('')
    try {
      const blob = await exportMaterialInRecords(queryParams())
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `来料明细_${history.startDate || '全部'}_${history.endDate || '至今'}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出来料明细失败')
    } finally { setExporting(false) }
  }

  const fetchMaterialIns = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setHistoryError('')
    try {
      const { data, pagination: paging, summary: totals } = await listMaterialInRecords(queryParams())
      if (request !== requestId.current) return
      setPagination(paging)
      setSummary(totals)
      setMaterialIns(data)
    } catch (err) {
      if (request !== requestId.current) return
      setMaterialIns([])
      setSummary([])
      setHistoryError(err instanceof Error ? err.message : '获取来料历史失败')
    }
    if (request === requestId.current) setLoading(false)
  }, [queryParams])

  useEffect(() => { void fetchMaterialIns() }, [fetchMaterialIns])
  useEffect(() => { setPage(1) }, [keyword, searchConditions, history])
  useEffect(() => () => { requestId.current += 1 }, [])

  return { materialIns, summary, pagination, loading, setLoading, historyError, setHistory, setPage, fetchMaterialIns, exportHistory, exporting, exportError }
}
