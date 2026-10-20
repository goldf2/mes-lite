'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Star } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import { openQuickAccessPanel } from '@/vendor/oaktech-saas-ui-0.2.15/native/panel-behavior.js'

/** React owns the content; the fixed shared asset owns the dialog lifecycle. */
export default function SharedQuickAccessPanel({ count, children }: {
  count: number
  children: (close: () => void) => ReactNode
}) {
  const [panel, setPanel] = useState<{ content: HTMLElement; returnFocus: HTMLElement } | null>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const closePanel = useCallback(() => closeRef.current?.(), [])

  useEffect(() => {
    if (!panel) return
    let disposed = false
    const close = openQuickAccessPanel({
      document,
      title: '常用与高频',
      content: panel.content,
      returnFocus: panel.returnFocus,
      onClose: () => {
        if (disposed) return
        closeRef.current = null
        setPanel(null)
      },
    })
    closeRef.current = close
    return () => {
      disposed = true
      closeRef.current = null
      close()
    }
  }, [panel])

  return (
    <>
      <AppButton
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={Boolean(panel)}
        data-floating="true"
        className="oak-quick-access-trigger mes-workspace-quick-access"
        onClick={(event) => {
          if (panel) return
          setPanel({ content: document.createElement('div'), returnFocus: event.currentTarget })
        }}
      >
        <Star aria-hidden="true" className="h-4 w-4" />
        常用与高频
        <span className="oak-quick-access-count" aria-label={`${count} 项收藏`}>{count}</span>
      </AppButton>
      {panel && createPortal(children(closePanel), panel.content)}
    </>
  )
}
