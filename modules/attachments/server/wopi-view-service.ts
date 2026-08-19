import { createHash, randomBytes } from 'crypto'
import { attachmentExtension, isSpreadsheetAttachment } from '@/lib/attachment-file-types'
import { prisma } from '@/lib/prisma'
import { AttachmentDomainError } from '../domain/attachment-errors'
import {
  requireManagedAttachmentAccess,
  requireManagedAttachmentAccessForOperator,
} from './attachment-authorization-service'
import { resolveWopiActionUrl } from './wopi-discovery-service'
import { verifyWopiProof } from './wopi-proof-service'

const defaultViewTokenTtlSeconds = 2 * 60 * 60

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function configuredTokenTtlSeconds() {
  const value = Number(process.env.WOPI_VIEW_TOKEN_TTL_SECONDS || defaultViewTokenTtlSeconds)
  if (!Number.isFinite(value)) return defaultViewTokenTtlSeconds
  return Math.min(8 * 60 * 60, Math.max(5 * 60, Math.round(value)))
}

function publicMesOrigin(requestUrl: string) {
  const configured = process.env.MES_PUBLIC_BASE_URL?.trim()
  const url = new URL(configured || requestUrl)
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new AttachmentDomainError('MES 公网地址必须使用 HTTPS', 503)
  }
  return url.origin
}

export function externalWopiRequestUrl(requestUrl: string) {
  const incoming = new URL(requestUrl)
  return new URL(`${incoming.pathname}${incoming.search}`, publicMesOrigin(requestUrl)).toString()
}

export function wopiItemVersion(attachment: { id: string; size: number; createdAt: Date }) {
  return `${attachment.id}-${attachment.size}-${attachment.createdAt.getTime()}`
}

export async function createWopiViewSession(attachmentId: string, requestUrl: string) {
  const { operator, attachment } = await requireManagedAttachmentAccess(attachmentId, 'read')
  if (!isSpreadsheetAttachment(attachment.originalName, attachment.mimeType)) {
    throw new AttachmentDomainError('该附件不是可直接浏览的表格文件', 400)
  }

  const extension = attachmentExtension(attachment.originalName).replace(/^\./, '')
  const actionUrl = await resolveWopiActionUrl(extension)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + configuredTokenTtlSeconds() * 1000)
  const wopiSourceUrl = new URL(`/api/wopi/files/${attachment.id}`, publicMesOrigin(requestUrl)).toString()
  actionUrl.searchParams.set('WOPISrc', wopiSourceUrl)

  const session = await prisma.$transaction(async (tx) => {
    await tx.wopiViewSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })
    return tx.wopiViewSession.create({
      data: {
        tokenHash: tokenHash(token),
        attachmentId: attachment.id,
        operatorId: operator.id,
        expiresAt,
      },
    })
  })

  return {
    operator,
    attachment,
    session: {
      id: session.id,
      formActionUrl: actionUrl.toString(),
      accessToken: token,
      accessTokenTtl: expiresAt.getTime(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}

export async function revokeWopiViewSession(sessionId: string, attachmentId: string, operatorId: string) {
  await prisma.wopiViewSession.updateMany({
    where: { id: sessionId, attachmentId, operatorId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function requireWopiViewAccess(request: Request, attachmentId: string) {
  const accessToken = new URL(request.url).searchParams.get('access_token')?.trim()
  if (!accessToken) throw new AttachmentDomainError('WOPI 访问令牌缺失', 401)

  const session = await prisma.wopiViewSession.findUnique({
    where: { tokenHash: tokenHash(accessToken) },
    include: { operator: true },
  })
  if (
    !session
    || session.attachmentId !== attachmentId
    || session.revokedAt
    || session.expiresAt <= new Date()
    || session.operator.status !== 'ACTIVE'
  ) throw new AttachmentDomainError('WOPI 访问令牌无效或已过期', 401)

  await verifyWopiProof(
    request,
    accessToken,
    externalWopiRequestUrl(request.url),
  )
  const { attachment } = await requireManagedAttachmentAccessForOperator(
    session.operator,
    attachmentId,
    'read',
  )
  if (!isSpreadsheetAttachment(attachment.originalName, attachment.mimeType)) {
    throw new AttachmentDomainError('该附件不支持在线表格查看', 404)
  }
  await prisma.wopiViewSession.update({
    where: { id: session.id },
    data: { lastAccessedAt: new Date() },
  })
  return { session, attachment }
}
