import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AttachmentDomainError } from '../domain/attachment-errors'
import { DocumentRecognitionError } from '../domain/document-recognition'

const providerErrors: Record<string, [string, number]> = {
  AI_DOCUMENT_OWNER_UNSUPPORTED: ['不支持该单据类型的凭据识别', 400],
  AI_DOCUMENT_NOT_FOUND: ['待识别附件不存在', 404],
  AI_DOCUMENT_OWNER_MISMATCH: ['附件与当前单据不匹配', 409],
  AI_AGENT_DISABLED: ['AI 助手已停用', 503],
  AI_AGENT_NOT_CONFIGURED: ['AI 服务尚未配置，请先在系统设置中配置支持视觉识别的模型', 503],
  AI_PROVIDER_TIMEOUT: ['AI 凭据识别超时，请稍后重试', 504],
  AI_DOCUMENT_UNSUPPORTED: ['该文件暂不支持 AI 识别，请使用图片、PDF、Office 或文本文件', 415],
  AI_DOCUMENT_INVALID_RESPONSE: ['AI 未返回可用的结构化字段，请检查模型是否支持视觉识别', 502],
}

export function documentRecognitionHttpError(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: 'AI 凭据识别参数不完整' }, { status: 400 })
  if (error instanceof AttachmentDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof DocumentRecognitionError) {
    const [message, status] = providerErrors[error.code] || ['AI 凭据识别失败，请检查视觉模型配置', 502]
    return NextResponse.json({ error: message }, { status })
  }
  console.error('AI document recognition error:', error)
  return NextResponse.json({ error: 'AI 凭据识别失败，请检查视觉模型配置' }, { status: 502 })
}
