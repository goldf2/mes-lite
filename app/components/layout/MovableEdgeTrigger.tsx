'use client'

import { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef, useState } from 'react'

const minRatio = 0.08
const maxRatio = 0.92

function clampRatio(value: number) {
  return Math.min(maxRatio, Math.max(minRatio, value))
}

export default function MovableEdgeTrigger({
  edge,
  storageKey,
  label,
  onActivate,
  children,
  badge,
  active = false,
  className = '',
}: {
  edge: 'left' | 'right'
  storageKey: string
  label: string
  onActivate: () => void
  children: ReactNode
  badge?: ReactNode
  active?: boolean
  className?: string
}) {
  const [positionRatio, setPositionRatio] = useState(0.5)
  const [dragging, setDragging] = useState(false)
  const pointerIdRef = useRef<number | null>(null)
  const startYRef = useRef(0)
  const startRatioRef = useRef(0.5)
  const latestRatioRef = useRef(0.5)
  const movedRef = useRef(false)

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey))
    if (Number.isFinite(saved)) {
      const next = clampRatio(saved)
      latestRatioRef.current = next
      setPositionRatio(next)
    }
  }, [storageKey])

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    pointerIdRef.current = event.pointerId
    startYRef.current = event.clientY
    startRatioRef.current = positionRatio
    movedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return
    const delta = event.clientY - startYRef.current
    if (!movedRef.current && Math.abs(delta) < 4) return
    movedRef.current = true
    setDragging(true)
    const next = clampRatio(startRatioRef.current + delta / Math.max(1, window.innerHeight))
    latestRatioRef.current = next
    setPositionRatio(next)
  }

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return
    pointerIdRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    if (movedRef.current) window.localStorage.setItem(storageKey, String(latestRatioRef.current))
  }

  const moveFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const next = clampRatio(positionRatio + (event.key === 'ArrowUp' ? -0.04 : 0.04))
    latestRatioRef.current = next
    setPositionRatio(next)
    window.localStorage.setItem(storageKey, String(next))
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={active}
      aria-label={label}
      title={`${label}（上下拖动可调整位置）`}
      style={{ top: `${positionRatio * 100}dvh` } as CSSProperties}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={moveFromKeyboard}
      onClick={(event) => {
        if (movedRef.current) {
          event.preventDefault()
          movedRef.current = false
          return
        }
        onActivate()
      }}
      className={`fixed z-[125] inline-flex h-11 w-10 -translate-y-1/2 touch-none select-none items-center justify-center border text-blue-700 shadow-md transition-[background-color,border-color,box-shadow] duration-200 ${edge === 'left' ? 'left-0 rounded-r-xl border-l-0' : 'right-0 rounded-l-xl border-r-0'} ${active ? 'border-blue-500 bg-blue-600 text-white shadow-blue-200' : 'border-blue-200 bg-white hover:bg-blue-50 hover:shadow-lg'} ${dragging ? 'cursor-grabbing ring-2 ring-blue-300' : 'cursor-ns-resize'} ${className}`}
    >
      {children}
      {badge !== undefined && (
        <span className={`absolute -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold ${edge === 'left' ? '-right-1' : '-left-1'} ${active ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'}`}>
          {badge}
        </span>
      )}
    </button>
  )
}
