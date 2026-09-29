'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResourceSearchCondition } from '@/lib/resource-search'
import { listMaterialInRecords } from '../client/material-in-api'
import type { MaterialInPagination, MaterialInRecord } from '../contracts/material-in'

export default function useMaterialInHistory(keyword: string, searchConditions: ResourceSearchCondition[]) {
  const [materialIns, setMaterialIns] = useState<MaterialInRecord[]>([])
  const [pagination, setPagination] = useState<MaterialInPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [historyError, setHistoryError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const queryParams = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (searchConditions.length > 0) params.set('advanced', JSON.stringify(searchConditions.map(({ field, operator, value }) => ({ field, operator, value }))))
    return params
  }, [keyword, searchConditions, page])

  const fetchMaterialIns = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setHistoryError('')
    try {
      const { data, pagination: paging } = await listMaterialInRecords(queryParams())
      if (request !== requestId.current) return
      setPagination(paging)
      setMaterialIns(data)
    } catch (err) {
      if (request !== requestId.current) return
      setMaterialIns([])
      setHistoryError(err instanceof Error ? err.message : '获取来料历史失败')
    }
    if (request === requestId.current) setLoading(false)
  }, [queryParams])

  useEffect(() => { void fetchMaterialIns() }, [fetchMaterialIns])
  useEffect(() => { setPage(1) }, [keyword, searchConditions])
  useEffect(() => () => { requestId.current += 1 }, [])

  return { materialIns, pagination, loading, setLoading, historyError, setPage, fetchMaterialIns }
}
