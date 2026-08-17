'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Database,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import AiAssistantMark from './AiAssistantMark'
import {
  loadAiAssistantStatus,
  recognizeAiAssistantImage,
  sendAiAssistantQuestion,
} from '@/modules/system-settings/client/ai-assistant-api'

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

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
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

function appendInput(current: string, addition: string) {
  const next = addition.trim()
  if (!next) return current
  return `${current.trimEnd()}${current.trim() ? '\n' : ''}${next}`.slice(
    0,
    4000,
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取图片文件'))
    reader.readAsDataURL(file)
  })
}

export default function AiAssistantPanel({
  open,
  onClose,
  onOpenSettings,
  pageContext,
  isAdmin,
}: {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
  pageContext: { key: string; label: string }
  isAdmin: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [inputNotice, setInputNotice] = useState('')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [imageRecognizing, setImageRecognizing] = useState(false)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const imageAbortRef = useRef<AbortController | null>(null)
  const speechRef = useRef<SpeechRecognitionLike | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setMounted(true)
    setSpeechSupported(
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    )
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setStatus(null)
    setStatusError('')
    loadAiAssistantStatus<AssistantStatus>()
      .then((value) => {
        if (!cancelled) setStatus(value)
      })
      .catch((error) => {
        if (!cancelled)
          setStatusError(
            error instanceof Error ? error.message : '无法检查 AI 服务状态',
          )
      })
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 150)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
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
      imageAbortRef.current?.abort()
      speechRef.current?.stop()
      abortRef.current = null
      imageAbortRef.current = null
      speechRef.current = null
      setListening(false)
      setImageRecognizing(false)
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [loading, messages])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      imageAbortRef.current?.abort()
      speechRef.current?.stop()
    },
    [],
  )

  const clearConversation = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    setMessages([])
    setInput('')
    setInputNotice('')
    inputRef.current?.focus()
  }

  const toggleSpeechInput = () => {
    if (listening) {
      speechRef.current?.stop()
      setListening(false)
      return
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setInputNotice('当前浏览器不支持语音输入，请使用 Chrome 或 Edge。')
      return
    }
    const recognition = new Recognition()
    speechRef.current = recognition
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      let transcript = ''
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index]
        if (result?.isFinal) transcript += result[0]?.transcript || ''
      }
      if (transcript.trim()) {
        setInput((current) => appendInput(current, transcript))
        setInputNotice('语音已转成文字，可继续编辑后发送。')
      }
    }
    recognition.onerror = () => {
      setInputNotice('语音识别失败，请检查麦克风权限后重试。')
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    try {
      recognition.start()
      setListening(true)
      setInputNotice('正在听写，请说出要询问的问题。')
    } catch {
      setInputNotice('无法启动语音输入，请检查浏览器麦克风权限。')
      setListening(false)
    }
  }

  const handleImageFile = async (file: File | undefined) => {
    if (!file || imageRecognizing) return
    if (!file.type.startsWith('image/')) {
      setInputNotice('请选择图片文件。')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setInputNotice('图片不能超过 5MB。')
      return
    }
    if (!status?.configured) {
      setInputNotice('AI 服务未配置，暂不能识别图片。')
      return
    }

    const controller = new AbortController()
    imageAbortRef.current = controller
    setImageRecognizing(true)
    setInputNotice('正在识别图片...')
    try {
      const imageDataUrl = await readFileAsDataUrl(file)
      const payload = await recognizeAiAssistantImage<{
        summary: string
        providerName?: string
        model?: string
      }>(
        {
          imageDataUrl,
          fileName: file.name,
          context: pageContext,
        },
        controller.signal,
      )
      const summary = payload.summary.trim()
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: 'assistant',
          content: `图片识别结果：\n${summary}`,
          sources: [payload.providerName || 'AI 图片识别'],
        },
      ])
      setInput((current) =>
        appendInput(current, `请结合这张图片识别结果回答：\n${summary}`),
      )
      setInputNotice('图片识别结果已加入输入框，可继续补充问题后发送。')
      inputRef.current?.focus()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : '图片识别失败',
          error: true,
        },
      ])
      setInputNotice('')
    } finally {
      if (imageAbortRef.current === controller) imageAbortRef.current = null
      setImageRecognizing(false)
    }
  }

  const sendQuestion = async (question: string) => {
    const content = question.trim()
    if (!content || loading || !status?.configured) return

    const userMessage: AssistantMessage = {
      id: messageId(),
      role: 'user',
      content,
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setInputNotice('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const payload = await sendAiAssistantQuestion<{
        message: string
        sources?: string[]
      }>(
        {
          messages: nextMessages
            .filter((message) => !message.error)
            .slice(-16)
            .map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
          context: pageContext,
        },
        controller.signal,
      )
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: 'assistant',
          content: payload.message,
          sources: Array.isArray(payload.sources) ? payload.sources : [],
        },
      ])
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'AI 服务暂时不可用',
          error: true,
        },
      ])
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <AiAssistantMark className="h-9 w-9" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-900">
                AI 协作助手
              </h2>
              <p className="truncate text-xs text-gray-500">
                当前：{pageContext.label}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="配置 AI 助手"
                title="配置 AI 助手"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <Settings2 aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
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
            <ShieldCheck
              aria-hidden="true"
              className="h-3.5 w-3.5 text-emerald-600"
            />
            只读
          </span>
          <span className="inline-flex items-center gap-1">
            <Database
              aria-hidden="true"
              className="h-3.5 w-3.5 text-blue-600"
            />
            按当前账号权限
          </span>
          {status?.configured && (
            <span className="ml-auto truncate text-gray-400">
              {status.providerName}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          {statusError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {statusError}
            </div>
          )}

          {status && (!status.enabled || !status.configured) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">
                {status.enabled ? 'AI 服务尚未配置' : 'AI 助手已停用'}
              </div>
              <p className="mt-1 text-amber-800">
                {status.enabled
                  ? isAdmin
                    ? '请在系统设置中配置国产模型的接口地址、模型 ID 和 API Key。'
                    : '请联系系统管理员完成国产模型服务配置。'
                  : isAdmin
                    ? '可在系统设置中重新启用 AI 助手。'
                    : '请联系系统管理员。'}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  打开 AI 配置
                </button>
              )}
            </div>
          )}

          {messages.length === 0 && (!status || status.configured) && (
            <div>
              <div className="flex items-start gap-3">
                <AiAssistantMark className="h-8 w-8 shrink-0" />
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
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] ${message.role === 'user' ? 'rounded-lg bg-blue-600 px-3.5 py-2.5 text-white' : ''}`}
                >
                  {message.role === 'assistant' && (
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-500">
                      <AiAssistantMark className="h-4 w-4" />
                      MES-lite AI
                    </div>
                  )}
                  <div
                    className={`whitespace-pre-wrap break-words text-sm leading-6 ${
                      message.role === 'user'
                        ? 'text-white'
                        : message.error
                          ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700'
                          : 'text-gray-800'
                    }`}
                  >
                    {message.content}
                  </div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.sources.map((source) => (
                        <span
                          key={source}
                          className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-500"
                        >
                          数据来源：{source}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div
                className="flex items-center gap-2 text-sm text-gray-500"
                role="status"
              >
                <Sparkles
                  aria-hidden="true"
                  className="h-4 w-4 animate-pulse text-blue-600"
                />
                正在查询业务数据...
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={submit}
          className="shrink-0 border-t border-gray-200 bg-white p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:p-4"
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void handleImageFile(file)
            }}
          />
          <div className="flex items-end gap-2 rounded-lg border border-gray-300 bg-white p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={toggleSpeechInput}
                disabled={loading}
                aria-label={listening ? '停止语音输入' : '语音输入'}
                title={
                  speechSupported
                    ? listening
                      ? '停止语音输入'
                      : '语音输入'
                    : '当前浏览器可能不支持语音输入'
                }
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 ${
                  listening
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {listening ? (
                  <MicOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Mic aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={!status?.configured || loading || imageRecognizing}
                aria-label="上传图片识别"
                title="上传图片识别"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {imageRecognizing ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <ImagePlus aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
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
              placeholder={
                status?.configured
                  ? '询问 MES-lite...'
                  : status?.enabled === false
                    ? 'AI 助手已停用'
                    : 'AI 服务未配置'
              }
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
          {inputNotice && (
            <p className="mt-2 text-xs text-gray-500" role="status">
              {inputNotice}
            </p>
          )}
        </form>
      </aside>
    </div>,
    document.body,
  )
}
