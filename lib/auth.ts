import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from './prisma'

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

export async function createOperatorSession(operatorId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.operatorSession.create({
    data: {
      tokenHash: hashToken(token),
      operatorId,
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getCurrentOperator() {
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

  if (session.operator.status !== 'ACTIVE') return null
  return session.operator
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
