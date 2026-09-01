'use client'

import { useEffect, useState } from 'react'
import type { SopCatalog } from '../contracts/sop'
import { loadSopCatalog } from '../client/sop-api'

export function useSopCatalog(pageKey?: string) {
  const [catalog, setCatalog] = useState<SopCatalog | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    loadSopCatalog(pageKey, controller.signal)
      .then(setCatalog)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '加载 SOP 失败')
      })
    return () => controller.abort()
  }, [pageKey])
  return { catalog, error }
}
