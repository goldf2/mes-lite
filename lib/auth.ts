import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from './prisma'
import { ensureAuthenticationRuntime } from '@/modules/identity-access/server/authentication-runtime-service'
import { sessionAuthenticationAllowed } from '@/modules/identity-access/server/authentication-session-policy'

export const SESSION_COOKIE = 'mes_lite_session'
const SESSION_DAYS = 7

export type OperatorRole = 'OPERATOR' | 'AUDITOR' | 'ADMIN'
export type OperatorStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'
export type OperatorPermission = 'submit' | 'audit' | 'manage'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const candidate = pbkdf2Sync(password, salt, 100000, 64, 'sha512')
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createOperatorSession(operatorId: string, authentication?: {
  authSource: 'native' | 'wechat' | 'casdoor' | 'native-admin-recovery'
  authAccountId?: string
  authSubject?: string
  authGeneration?: string
  challengeTicketHash?: string
}) {
  const runtime = await ensureAuthenticationRuntime()
  if (!authentication && runtime.mode !== 'builtin') throw new Error('LOGIN_METHOD_DISABLED')
  if (authentication?.authSource === 'casdoor' && (runtime.mode !== 'casdoor' || !runtime.ready
    || authentication.authGeneration !== runtime.state.generation)) throw new Error('LOGIN_CONFIGURATION_CHANGED')
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.$transaction(async tx => {
    const attempt = authentication?.challengeTicketHash
      ? await tx.operatorLoginChallenge.findUnique({ where: { ticketHash: authentication.challengeTicketHash } }) : null
    if (authentication?.authSource === 'casdoor' && (!attempt || !attempt.consumedAt || attempt.sessionId
      || attempt.expiresAt <= new Date() || attempt.generation !== runtime.state.generation)) throw new Error('LOGIN_EXPIRED')
    const session = await tx.operatorSession.create({
      data: {
      tokenHash: hashToken(token),
      operatorId,
      expiresAt,
      authSource: authentication?.authSource || 'native',
      authAccountId: authentication?.authAccountId,
      authSubject: authentication?.authSubject,
      authGeneration: authentication?.authSource === 'native-admin-recovery' ? null : authentication?.authGeneration || runtime.state.generation,
      },
    })
    if (attempt) await tx.operatorLoginChallenge.update({ where: { ticketHash: attempt.ticketHash }, data: { sessionId: session.id } })
  })

  return { token, expiresAt }
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function getCurrentOperatorSession() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.operatorSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      operator: {
        select: {
          id: true,
          username: true,
          name: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          approvedAt: true,
        },
      },
    },
  })

  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.operatorSession.delete({ where: { id: session.id } })
    return null
  }

  if (!await sessionAuthenticationAllowed(session, session.operator)) {
    await prisma.operatorSession.deleteMany({ where: { id: session.id } })
    return null
  }
  return session
}

export async function getCurrentOperator() {
  return (await getCurrentOperatorSession())?.operator ?? null
}

/** Verified login identity, never inferred from an account sharing an email/name. */
export async function getCurrentCasdoorActor() {
  const session = await getCurrentOperatorSession()
  if (!session || session.authSource !== 'casdoor' || !session.authSubject) return null
  const runtime = await ensureAuthenticationRuntime()
  if (runtime.mode !== 'casdoor' || !runtime.ready || !runtime.connection
    || session.authGeneration !== runtime.state.generation) return null
  return { operator: session.operator, issuer: runtime.connection.issuer, subject: session.authSubject }
}

export function operatorDisplayName(operator: { name?: string | null; username: string }) {
  return operator.name?.trim() || operator.username
}

export function canAudit(role: string) {
  return role === 'AUDITOR' || role === 'ADMIN'
}

export function canManage(role: string) {
  return role === 'ADMIN'
}

export function canSubmit(role: string) {
  return role === 'OPERATOR' || role === 'AUDITOR' || role === 'ADMIN'
}

export function hasPermission(role: string, permission: OperatorPermission) {
  if (permission === 'submit') return canSubmit(role)
  if (permission === 'audit') return canAudit(role)
  return canManage(role)
}

export async function requirePermission(permission: OperatorPermission) {
  const current = await getCurrentOperator()
  if (!current || !hasPermission(current.role, permission)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }
  return null
}
