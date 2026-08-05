'use client'

import { CSSProperties, PointerEvent, useId, useMemo } from 'react'
import {
  renderAiAssistantMarkSvg,
} from '@/lib/ai-assistant-mark'
import { useAiAssistantAppearance } from './AiAssistantAppearanceProvider'

type MarkStyle = CSSProperties & {
  '--mes-ai-rotation-seconds': string
  '--mes-ai-breathing-seconds': string
  '--mes-ai-breath-scale': number
  '--mes-ai-pressed-scale': number
  '--mes-ai-shift-x': string
  '--mes-ai-shift-y': string
}

export default function AiAssistantMark({
  className = '',
  animated = false,
  priority = false,
}: {
  className?: string
  animated?: boolean
  priority?: boolean
}) {
  const { config } = useAiAssistantAppearance()
  const reactId = useId()
  const svg = useMemo(() => renderAiAssistantMarkSvg(config, `mes-ai-${reactId}`), [config, reactId])
  const style: MarkStyle = {
    '--mes-ai-rotation-seconds': `${config.rotationSeconds}s`,
    '--mes-ai-breathing-seconds': `${config.breathingSeconds}s`,
    '--mes-ai-breath-scale': config.breathScale,
    '--mes-ai-pressed-scale': config.pressedScale,
    '--mes-ai-shift-x': '0px',
    '--mes-ai-shift-y': '0px',
  }

  const updatePointer = (event: PointerEvent<HTMLSpanElement>) => {
    if (!animated || config.pointerShift === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width / 2)
    const y = (event.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height / 2)
    event.currentTarget.style.setProperty('--mes-ai-shift-x', `${x * config.pointerShift}px`)
    event.currentTarget.style.setProperty('--mes-ai-shift-y', `${y * config.pointerShift}px`)
  }

  const resetPointer = (event: PointerEvent<HTMLSpanElement>) => {
    event.currentTarget.style.setProperty('--mes-ai-shift-x', '0px')
    event.currentTarget.style.setProperty('--mes-ai-shift-y', '0px')
  }

  void priority

  return (
    <span
      aria-hidden="true"
      style={style}
      className={`relative inline-block aspect-square shrink-0 ${className}`}
      onPointerEnter={updatePointer}
      onPointerMove={updatePointer}
      onPointerLeave={resetPointer}
      onPointerCancel={resetPointer}
    >
      <span
        className="mes-ai-assistant-pointer absolute inset-0"
      >
        <span
          className={`absolute inset-0 ${animated && config.rotationEnabled ? 'mes-ai-assistant-orbit' : ''}`}
        >
          <span
            className={`absolute inset-0 ${animated ? 'mes-ai-assistant-mark' : ''}`}
            data-breathing={config.breathingEnabled ? 'true' : 'false'}
          >
            <span
              className="absolute inset-0"
              style={{ transform: `scale(${config.iconScale})`, transformOrigin: 'center' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </span>
        </span>
      </span>
    </span>
  )
}
