'use client'

import { CSSProperties, PointerEvent, useEffect, useId, useMemo, useState } from 'react'
import {
  AiAssistantMarkConfig,
  defaultAiAssistantMarkConfig,
  normalizeAiAssistantMarkConfig,
  renderAiAssistantMarkSvg,
} from '@/lib/ai-assistant-mark'

type MarkStyle = CSSProperties & {
  '--mes-ai-rotation-seconds': string
  '--mes-ai-breathing-seconds': string
  '--mes-ai-breath-scale': number
  '--mes-ai-pressed-scale': number
  '--mes-ai-shift-x': string
  '--mes-ai-shift-y': string
}

let cachedConfig = normalizeAiAssistantMarkConfig(defaultAiAssistantMarkConfig)
let configRequest: Promise<void> | null = null
let configLoaded = false
let messageListenerReady = false
const configSubscribers = new Set<(config: AiAssistantMarkConfig) => void>()

function publishConfig(value: unknown) {
  cachedConfig = normalizeAiAssistantMarkConfig(value)
  configSubscribers.forEach((subscriber) => subscriber(cachedConfig))
}

function ensureMessageListener() {
  if (messageListenerReady || typeof window === 'undefined') return
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'mes-ai-mark-config-updated') return
    publishConfig(event.data.config)
  })
  messageListenerReady = true
}

async function loadPublishedConfig() {
  if (configLoaded) return
  if (configRequest) return configRequest
  configRequest = fetch('/api/ai/mark-config', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return
      const payload = await response.json()
      publishConfig(payload.data?.config)
      configLoaded = true
    })
    .catch(() => undefined)
    .finally(() => {
      configRequest = null
    })
  return configRequest
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
  const [config, setConfig] = useState(cachedConfig)
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

  useEffect(() => {
    ensureMessageListener()
    configSubscribers.add(setConfig)
    void loadPublishedConfig()
    return () => {
      configSubscribers.delete(setConfig)
    }
  }, [])

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
