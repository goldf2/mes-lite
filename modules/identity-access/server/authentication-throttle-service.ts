import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { AuthenticationError } from '../domain/authentication'

function throttleKeyHash(scope: string, clientKey: string) {
  return createHash('sha256').update(`${scope}:${clientKey}`).digest('hex')
}

function retryAfterSeconds(blockedUntil: Date, now: Date) {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000))
}

export async function consumeAuthenticationThrottle(input: {
  scope: string
  clientKey: string
  limit: number
  windowMs: number
  blockMs: number
  now?: Date
}) {
  const now = input.now || new Date()
  const keyHash = throttleKeyHash(input.scope, input.clientKey)
  await prisma.authenticationThrottle.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
  })
  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.authenticationThrottle.findUnique({
      where: { scope_keyHash: { scope: input.scope, keyHash } },
    })
    if (!current) {
      await tx.authenticationThrottle.create({
        data: { scope: input.scope, keyHash, windowStartedAt: now, attemptCount: 1 },
      })
      return { blockedUntil: null }
    }
    if (current.blockedUntil && current.blockedUntil > now) {
      return { blockedUntil: current.blockedUntil }
    }
    if (now.getTime() - current.windowStartedAt.getTime() >= input.windowMs || current.blockedUntil) {
      await tx.authenticationThrottle.update({
        where: { id: current.id },
        data: { windowStartedAt: now, attemptCount: 1, blockedUntil: null },
      })
      return { blockedUntil: null }
    }
    const updated = await tx.authenticationThrottle.update({
      where: { id: current.id },
      data: { attemptCount: { increment: 1 } },
      select: { attemptCount: true },
    })
    if (updated.attemptCount > input.limit) {
      const blockedUntil = new Date(now.getTime() + input.blockMs)
      await tx.authenticationThrottle.update({ where: { id: current.id }, data: { blockedUntil } })
      return { blockedUntil }
    }
    return { blockedUntil: null }
  })
  if (outcome.blockedUntil) {
    throw new AuthenticationError(
      '请求过于频繁，请稍后再试',
      429,
      retryAfterSeconds(outcome.blockedUntil, now),
    )
  }
}
