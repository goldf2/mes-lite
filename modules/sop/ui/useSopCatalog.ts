'use client'

import { useEffect, useState } from 'react'
import type { SopCatalog } from '../contracts/sop'

export function useSopCatalog(pageKey?: string) {
  const [catalog, setCatalog] = useState<SopCatalog | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const query = pageKey ? `?pageKey=${encodeURIComponent(pageKey)}` : ''
    fetch(`/api/sop${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || '加载 SOP 失败')
        setCatalog(payload.data)
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '加载 SOP 失败')
      })
    return () => controller.abort()
  }, [pageKey])
  return { catalog, error }
}
