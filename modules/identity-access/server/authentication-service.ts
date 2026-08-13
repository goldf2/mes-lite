import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { WeChatUserProfile } from '@/lib/wechatAuth'
import { WECHAT_WEB_PROVIDER } from '@/lib/wechatAuth'
import { createOperatorSession, hashPassword, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { InitialAdministratorInput, LoginInput, RegisterInput } from '../contracts/authentication'
import {
  AuthenticationError,
  PASSWORD_FAILURE_LIMIT,
  PASSWORD_FAILURE_WINDOW_MS,
  PASSWORD_LOCK_MS,
  operatorLoginStatusError,
  weChatUsernameBase,
} from '../domain/authentication'

const operatorPublicSelect = {
  id: true, username: true, name: true, phone: true, role: true, status: true, createdAt: true,
} as const

const dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'))

function secondsUntil(value: Date, now: Date) {
  return Math.max(1, Math.ceil((value.getTime() - now.getTime()) / 1000))
}

async function recordFailedPasswordLogin(operatorId: string, now: Date) {
  const reset = await prisma.operator.updateMany({
    where: {
      id: operatorId,
      OR: [
        { lastFailedLoginAt: null },
        { lastFailedLoginAt: { lte: new Date(now.getTime() - PASSWORD_FAILURE_WINDOW_MS) } },
      ],
    },
    data: { failedLoginAttempts: 1, lastFailedLoginAt: now, lockedUntil: null },
  })
  const failedLoginAttempts = reset.count === 1
    ? 1
    : (await prisma.operator.update({
      where: { id: operatorId },
      data: { failedLoginAttempts: { increment: 1 }, lastFailedLoginAt: now },
      select: { failedLoginAttempts: true },
    })).failedLoginAttempts
  const lockedUntil = failedLoginAttempts >= PASSWORD_FAILURE_LIMIT
    ? new Date(now.getTime() + PASSWORD_LOCK_MS)
    : null
  if (lockedUntil) await prisma.operator.update({ where: { id: operatorId }, data: { lockedUntil } })
  return lockedUntil
}

export function verifyInitialAdministratorToken(providedToken?: string | null) {
  const expectedToken = process.env.MES_INITIAL_ADMIN_TOKEN?.trim()
  if (!expectedToken || expectedToken.length < 32) {
    throw new AuthenticationError('管理员安装入口未启用', 404)
  }
  const provided = providedToken?.trim() || ''
  const expectedHash = createHash('sha256').update(expectedToken).digest()
  const providedHash = createHash('sha256').update(provided).digest()
  if (!timingSafeEqual(expectedHash, providedHash)) {
    throw new AuthenticationError('管理员安装凭证无效', 403)
  }
}

export async function loginWithPassword(input: LoginInput, now = new Date()) {
  const operator = await prisma.operator.findUnique({ where: { username: input.username } })
  if (operator?.lockedUntil && operator.lockedUntil > now) {
    throw new AuthenticationError('登录失败次数过多，请稍后再试', 429, secondsUntil(operator.lockedUntil, now))
  }
  const passwordValid = verifyPassword(input.password, operator?.passwordHash || dummyPasswordHash)
  if (!operator || !passwordValid) {
    const lockedUntil = operator ? await recordFailedPasswordLogin(operator.id, now) : null
    if (lockedUntil) {
      throw new AuthenticationError('登录失败次数过多，请稍后再试', 429, secondsUntil(lockedUntil, now))
    }
    throw new AuthenticationError('账号或密码错误', 401)
  }
  const statusError = operatorLoginStatusError(operator.status)
  if (statusError) {
    await prisma.operator.update({
      where: { id: operator.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
    })
    throw statusError
  }
  const session = await createOperatorSession(operator.id)
  await prisma.operator.update({
    where: { id: operator.id },
    data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
  })
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
  return prisma.operator.create({
    data: {
      username: input.username, passwordHash: hashPassword(input.password), name: input.name,
      phone: input.phone || undefined, role: 'OPERATOR', status: 'PENDING',
      dataScope: { create: { productionMode: 'SELF', inventoryMode: 'LOCATIONS' } },
    },
    select: operatorPublicSelect,
  })
}

export async function installInitialAdministrator(
  input: InitialAdministratorInput,
  providedToken?: string | null,
) {
  verifyInitialAdministratorToken(providedToken)
  return prisma.$transaction(async (tx) => {
    if (await tx.operator.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) {
      throw new AuthenticationError('系统管理员已经安装，入口已关闭', 409)
    }
    if (await tx.operator.findUnique({ where: { username: input.username }, select: { id: true } })) {
      throw new AuthenticationError('该管理员账号已存在，请更换账号', 409)
    }
    const operator = await tx.operator.create({
      data: {
        username: input.username,
        passwordHash: hashPassword(input.password),
        name: input.name,
        phone: input.phone || undefined,
        role: 'ADMIN',
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy: 'SYSTEM_SETUP',
      },
      select: operatorPublicSelect,
    })
    await tx.auditLog.create({
      data: {
        operatorId: operator.id,
        operatorName: operator.name,
        action: 'SYSTEM_SETUP',
        entityType: 'OPERATOR',
        entityId: operator.id,
        entityLabel: operator.username,
        afterData: JSON.stringify({ role: operator.role, status: operator.status }),
        note: '显式安装首位管理员',
      },
    })
    return operator
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
    const username = await createUniqueWeChatUsername(profile.openid)
    authAccount = await prisma.$transaction(async (tx) => {
      const operator = await tx.operator.create({
        data: {
          username, passwordHash: hashPassword(randomBytes(24).toString('hex')),
          name: profile.nickname || `微信用户${profile.openid.slice(-6)}`,
          role: 'OPERATOR', status: 'PENDING',
          dataScope: { create: { productionMode: 'SELF', inventoryMode: 'LOCATIONS' } },
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
  await prisma.operator.update({
    where: { id: operator.id },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
  })
  return session
}

export async function revokeOperatorSession(token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await prisma.operatorSession.deleteMany({ where: { tokenHash } })
}
