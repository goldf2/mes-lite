'use client'

import { useCallback, useState } from 'react'

const DEFAULT_MAX_HEIGHT = 256
const VIEWPORT_GAP = 8

export default function useSearchPopupPlacement() {
  const [openUpward, setOpenUpward] = useState(false)
  const [popupMaxHeight, setPopupMaxHeight] = useState(DEFAULT_MAX_HEIGHT)

  const updatePopupPlacement = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    const spaceAbove = Math.max(0, rect.top - VIEWPORT_GAP)
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - VIEWPORT_GAP)
    const nextOpenUpward = spaceBelow < DEFAULT_MAX_HEIGHT && spaceAbove > spaceBelow
    const availableSpace = nextOpenUpward ? spaceAbove : spaceBelow

    setOpenUpward(nextOpenUpward)
    setPopupMaxHeight(Math.min(DEFAULT_MAX_HEIGHT, availableSpace))
  }, [])

  return { openUpward, popupMaxHeight, updatePopupPlacement }
}
