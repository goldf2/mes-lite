'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Database, Send, ShieldCheck, Sparkles, Square, Trash2, X } from 'lucide-react'

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  error?: boolean
}

interface AssistantStatus {
  enabled: boolean
  configured: boolean
  providerName: string
  model: string | null
  mode: 'READ_ONLY'
  tools: string[]
}

const quickQuestions = [
  '这个页面应该怎么使用？',
  '查询当前低库存物料',
  '总结今天的生产和待处理事项',
  '如何查某个物料涉及的 BOM？',
]

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function AiAssistantPanel({
  open,
  onClose,
  pageContext,
  isAdmin,
}: {
  open: boolean
  onClose: () => void
  pageContext: { key: string; label: string }
  isAdmin: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setStatus(null)
    setStatusError('')
    fetch('/api/ai/status')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || '无法检查 AI 服务状态')
        if (!cancelled) setStatus(payload.data)
      })
      .catch((error) => {
        if (!cancelled) setStatusError(error instanceof Error ? error.message : '无法检查 AI 服务状态')
      })
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 150)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      cancelled = true
      document.body.style.overflow = previousOverflow
      abortRef.current?.abort()
      abortRef.current = null
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [loading, messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const clearConversation = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const sendQuestion = async (question: string) => {
    const content = question.trim()
    if (!content || loading || !status?.configured) return

    const userMessage: AssistantMessage = { id: messageId(), role: 'user', content }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => !message.error)
            .slice(-16)
            .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          context: pageContext,
        }),
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'AI 服务暂时不可用')
      setMessages((current) => [...current, {
        id: messageId(),
        role: 'assistant',
        content: payload.data.message,
        sources: Array.isArray(payload.data.sources) ? payload.data.sources : [],
      }])
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setMessages((current) => [...current, {
        id: messageId(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'AI 服务暂时不可用',
        error: true,
      }])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void sendQuestion(input)
  }

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-slate-950/20 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI 协作助手"
        className="absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col border-l border-gray-200 bg-white shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-900">AI 协作助手</h2>
              <p className="truncate text-xs text-gray-500">当前：{pageContext.label}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={clearConversation}
              disabled={messages.length === 0 && !loading}
              aria-label="清空对话"
              title="清空对话"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭 AI 助手"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600 sm:px-5">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
            只读
          </span>
          <span className="inline-flex items-center gap-1">
            <Database aria-hidden="true" className="h-3.5 w-3.5 text-blue-600" />
            按当前账号权限
          </span>
          {status?.configured && <span className="ml-auto truncate text-gray-400">{status.providerName}</span>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          {statusError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {statusError}
            </div>
          )}

          {status && (!status.enabled || !status.configured) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">{status.enabled ? 'AI 服务尚未配置' : 'AI 助手已停用'}</div>
              <p className="mt-1 text-amber-800">
                {status.enabled
                  ? (isAdmin
                      ? '请在 Coolify 中配置国产模型的接口地址、模型名称和 API 密钥。'
                      : '请联系系统管理员完成国产模型服务配置。')
                  : (isAdmin ? '可在 Coolify 中重新启用 AI Agent。' : '请联系系统管理员。')}
              </p>
            </div>
          )}

          {messages.length === 0 && (!status || status.configured) && (
            <div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Bot aria-hidden="true" className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm leading-6 text-gray-700">
                    直接告诉我你要查询的物料、库存、BOM、生产情况，或者询问当前页面如何使用。
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {quickQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void sendQuestion(question)}
                    disabled={!status?.configured}
                    className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] ${message.role === 'user' ? 'rounded-lg bg-blue-600 px-3.5 py-2.5 text-white' : ''}`}>
                  {message.role === 'assistant' && (
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-500">
                      <Bot aria-hidden="true" className="h-4 w-4 text-blue-600" />
                      MES-lite AI
                    </div>
                  )}
                  <div className={`whitespace-pre-wrap break-words text-sm leading-6 ${
                    message.role === 'user'
                      ? 'text-white'
                      : message.error
                        ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700'
                        : 'text-gray-800'
                  }`}>
                    {message.content}
                  </div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.sources.map((source) => (
                        <span key={source} className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-500">
                          数据来源：{source}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-500" role="status">
                <Sparkles aria-hidden="true" className="h-4 w-4 animate-pulse text-blue-600" />
                正在查询业务数据...
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form onSubmit={submit} className="shrink-0 border-t border-gray-200 bg-white p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:p-4">
          <div className="flex items-end gap-2 rounded-lg border border-gray-300 bg-white p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 4000))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (input.trim()) void sendQuestion(input)
                }
              }}
              disabled={!status?.configured || loading}
              rows={2}
              placeholder={status?.configured ? '询问 MES-lite...' : status?.enabled === false ? 'AI 助手已停用' : 'AI 服务未配置'}
              className="max-h-32 min-h-12 min-w-0 flex-1 resize-none border-0 px-1 py-1.5 text-sm leading-5 outline-none disabled:bg-white disabled:text-gray-400"
            />
            {loading ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="停止回答"
                title="停止回答"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-white hover:bg-gray-900"
              >
                <Square aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!status?.configured || !input.trim()}
                aria-label="发送问题"
                title="发送问题"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  )
}
