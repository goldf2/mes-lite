import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { documentRecognitionInputSchema } from '@/modules/attachments/contracts/document-recognition'
import { documentRecognitionHttpError } from '@/modules/attachments/http/document-recognition-http'
import { recognizeDocumentAttachment } from '@/modules/attachments/server/document-recognition-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const attachmentDenied = await requireResourcePermission('attachments', 'read')
  if (attachmentDenied) return attachmentDenied
  const aiDenied = await requireResourcePermission('aiAssistant', 'read')
  if (aiDenied) return aiDenied
  try {
    const { attachment, config, result } = await recognizeDocumentAttachment(documentRecognitionInputSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'QUERY', entityType: 'AI_DOCUMENT_RECOGNITION', entityId: attachment.id, entityLabel: attachment.originalName,
      afterData: {
        ownerType: attachment.ownerType, provider: config.providerName, model: config.model,
        autoFilledFieldCount: Object.keys(result.autoFilledFields).length, unrecognizedFieldCount: result.unrecognized.length,
      },
      note: '未记录凭据正文和识别字段内容',
    })
    const count = Object.keys(result.autoFilledFields).length
    return NextResponse.json({
      data: {
        fields: result.autoFilledFields, suggestions: result.fields, confidence: result.confidence,
        unrecognized: result.unrecognized, sourceAttachmentId: attachment.id,
        providerName: config.providerName, model: config.model,
      },
      message: count ? `AI 识别完成，已回填 ${count} 个高置信度字段，请人工核对` : 'AI 识别完成，但没有达到自动回填阈值的字段，请人工录入',
    })
  } catch (error) {
    return documentRecognitionHttpError(error)
  }
}
