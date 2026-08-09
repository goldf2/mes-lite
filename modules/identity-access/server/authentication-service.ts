import { createHash, randomBytes } from 'crypto'
import type { WeChatUserProfile } from '@/lib/wechatAuth'
import { WECHAT_WEB_PROVIDER } from '@/lib/wechatAuth'
import { createOperatorSession, hashPassword, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { LoginInput, RegisterInput } from '../contracts/authentication'
import { AuthenticationError, operatorLoginStatusError, weChatUsernameBase } from '../domain/authentication'

const operatorPublicSelect = {
  id: true, username: true, name: true, phone: true, role: true, status: true, createdAt: true,
} as const

export async function loginWithPassword(input: LoginInput) {
  const operator = await prisma.operator.findUnique({ where: { username: input.username } })
  if (!operator || !verifyPassword(input.password, operator.passwordHash)) throw new AuthenticationError('账号或密码错误', 401)
  const statusError = operatorLoginStatusError(operator.status)
  if (statusError) throw statusError
  const session = await createOperatorSession(operator.id)
  await prisma.operator.update({ where: { id: operator.id }, data: { lastLoginAt: new Date() } })
  return {
    operator: {
      id: operator.id, username: operator.username, name: operator.name, phone: operator.phone,
      role: operator.role, status: operator.status,
    },
    session,
  }
}

export async function registerOperator(input: RegisterInput) {
  const existing = await prisma.operator.findUnique({ where: { username: input.username } })
  if (existing) throw new AuthenticationError('账号已存在', 400)
  return prisma.$transaction(async (tx) => {
    const isFirstOperator = await tx.operator.count() === 0
    const operator = await tx.operator.create({
      data: {
        username: input.username, passwordHash: hashPassword(input.password), name: input.name,
        phone: input.phone || undefined, role: isFirstOperator ? 'ADMIN' : 'OPERATOR',
        status: isFirstOperator ? 'ACTIVE' : 'PENDING', approvedAt: isFirstOperator ? new Date() : undefined,
      },
      select: operatorPublicSelect,
    })
    return { operator, isFirstOperator }
  })
}

async function createUniqueWeChatUsername(openid: string) {
  const base = weChatUsernameBase(openid, randomBytes(4).toString('hex'))
  let username = base
  let index = 1
  while (await prisma.operator.findUnique({ where: { username } })) {
    username = `${base}_${index}`.slice(0, 32)
    index += 1
  }
  return username
}

export async function resolveWeChatOperator(profile: WeChatUserProfile) {
  const rawData = profile.rawData ? JSON.stringify(profile.rawData) : undefined
  let authAccount = await prisma.operatorAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: WECHAT_WEB_PROVIDER, providerUserId: profile.openid } },
    include: { operator: true },
  })
  if (!authAccount && profile.unionid) authAccount = await prisma.operatorAuthAccount.findFirst({
    where: { provider: WECHAT_WEB_PROVIDER, unionId: profile.unionid }, include: { operator: true },
  })
  let created = false
  if (!authAccount) {
    const isFirstOperator = await prisma.operator.count() === 0
    const username = await createUniqueWeChatUsername(profile.openid)
    authAccount = await prisma.$transaction(async (tx) => {
      const operator = await tx.operator.create({
        data: {
          username, passwordHash: hashPassword(randomBytes(24).toString('hex')),
          name: profile.nickname || `微信用户${profile.openid.slice(-6)}`,
          role: isFirstOperator ? 'ADMIN' : 'OPERATOR', status: isFirstOperator ? 'ACTIVE' : 'PENDING',
          approvedAt: isFirstOperator ? new Date() : undefined,
        },
      })
      return tx.operatorAuthAccount.create({
        data: {
          provider: WECHAT_WEB_PROVIDER, providerUserId: profile.openid, unionId: profile.unionid,
          nickname: profile.nickname, avatarUrl: profile.avatarUrl, rawData, operatorId: operator.id,
        },
        include: { operator: true },
      })
    })
    created = true
  } else {
    await prisma.operatorAuthAccount.update({
      where: { id: authAccount.id },
      data: {
        unionId: profile.unionid || authAccount.unionId,
        nickname: profile.nickname || authAccount.nickname,
        avatarUrl: profile.avatarUrl || authAccount.avatarUrl,
        rawData,
      },
    })
  }
  return { operator: authAccount.operator, created }
}

export async function startOperatorSession(operator: { id: string; status: string }) {
  const statusError = operatorLoginStatusError(operator.status)
  if (statusError) throw statusError
  const session = await createOperatorSession(operator.id)
  await prisma.operator.update({ where: { id: operator.id }, data: { lastLoginAt: new Date() } })
  return session
}

export async function revokeOperatorSession(token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await prisma.operatorSession.deleteMany({ where: { tokenHash } })
}
