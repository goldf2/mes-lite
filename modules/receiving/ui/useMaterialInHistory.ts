'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResourceSearchCondition } from '@/lib/resource-search'
import { listMaterialInRecords } from '../client/material-in-api'
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
  const requestId = useRef(0)

  const fetchMaterialIns = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setHistoryError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20', includeSummary: 'true', startDate: history.startDate, endDate: history.endDate, includeArchived: String(history.includeArchived) })
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (searchConditions.length > 0) params.set('advanced', JSON.stringify(searchConditions.map(({ field, operator, value }) => ({ field, operator, value }))))
      const { data, pagination: paging, summary: totals } = await listMaterialInRecords(params)
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
  }, [keyword, searchConditions, history, page])

  useEffect(() => { void fetchMaterialIns() }, [fetchMaterialIns])
  useEffect(() => { setPage(1) }, [keyword, searchConditions, history])
  useEffect(() => () => { requestId.current += 1 }, [])

  return { materialIns, summary, pagination, loading, setLoading, historyError, setHistory, setPage, fetchMaterialIns }
}
