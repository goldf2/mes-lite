'use client'

import { useEffect, useState } from 'react'

export default function useCompactViewport(maxWidth = 639) {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setIsCompact(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [maxWidth])

  return isCompact
}
