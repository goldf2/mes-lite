'use client'

import { Children, CSSProperties, ReactNode, useEffect, useRef, useState } from 'react'

export default function SplitWorkspace({
  children,
  storageKey,
  primaryLabel,
  secondaryLabel,
  defaultPrimaryPercent = 50,
  minPrimaryPercent = 35,
  maxPrimaryPercent = 65,
  className = '',
}: {
  children: ReactNode
  storageKey: string
  primaryLabel: string
  secondaryLabel: string
  defaultPrimaryPercent?: number
  minPrimaryPercent?: number
  maxPrimaryPercent?: number
  className?: string
}) {
  const panels = Children.toArray(children)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [primaryPercent, setPrimaryPercent] = useState(defaultPrimaryPercent)
  const [storageReady, setStorageReady] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey))
    if (Number.isFinite(saved) && saved >= minPrimaryPercent && saved <= maxPrimaryPercent) {
      setPrimaryPercent(saved)
    }
    setStorageReady(true)
  }, [maxPrimaryPercent, minPrimaryPercent, storageKey])

  useEffect(() => {
    if (!storageReady) return
    window.localStorage.setItem(storageKey, String(primaryPercent))
  }, [primaryPercent, storageKey, storageReady])

  useEffect(() => {
    if (!dragging) return

    const move = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      const next = ((event.clientX - rect.left) / rect.width) * 100
      setPrimaryPercent(Math.min(maxPrimaryPercent, Math.max(minPrimaryPercent, next)))
    }
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [dragging, maxPrimaryPercent, minPrimaryPercent])

  if (panels.length !== 2) {
    throw new Error('SplitWorkspace 需要且只接受两个工作区')
  }

  const adjustByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -2 : 2
    setPrimaryPercent((current) => Math.min(maxPrimaryPercent, Math.max(minPrimaryPercent, current + delta)))
  }

  return (
    <div
      ref={containerRef}
      style={{
        '--split-primary': `${primaryPercent}fr`,
        '--split-secondary': `${100 - primaryPercent}fr`,
      } as CSSProperties}
      className={`grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,var(--split-primary))_12px_minmax(0,var(--split-secondary))] xl:items-stretch xl:gap-0 ${className}`}
    >
      <div aria-label={primaryLabel} className="min-w-0 xl:pr-2">{panels[0]}</div>
      <div
        role="separator"
        aria-label={`调整${primaryLabel}与${secondaryLabel}宽度`}
        aria-orientation="vertical"
        aria-valuemin={minPrimaryPercent}
        aria-valuemax={maxPrimaryPercent}
        aria-valuenow={Math.round(primaryPercent)}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onKeyDown={adjustByKeyboard}
        className={`group hidden cursor-col-resize items-stretch justify-center outline-none xl:flex ${
          dragging ? 'bg-blue-50' : ''
        }`}
      >
        <div className={`w-px transition group-hover:bg-blue-400 group-focus:bg-blue-500 ${dragging ? 'bg-blue-500' : 'bg-gray-200'}`} />
      </div>
      <div aria-label={secondaryLabel} className="min-w-0 xl:pl-2">{panels[1]}</div>
    </div>
  )
}
