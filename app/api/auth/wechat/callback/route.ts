import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { createOperatorSession, hashPassword, setSessionCookie } from '@/lib/auth'
import {
  WECHAT_STATE_COOKIE,
  WECHAT_WEB_PROVIDER,
  buildAuthPageUrl,
  getWeChatWebConfig,
  getWeChatWebProfile,
} from '@/lib/wechatAuth'

function createWeChatUsername(openid: string) {
  return `wx_${openid.replace(/[^a-zA-Z0-9]/g, '').slice(-16) || randomBytes(4).toString('hex')}`
}

async function createUniqueWeChatUsername(openid: string) {
  const base = createWeChatUsername(openid).slice(0, 28)
  let username = base
  let index = 1

  while (await prisma.operator.findUnique({ where: { username } })) {
    username = `${base}_${index}`.slice(0, 32)
    index += 1
  }

  return username
}

function redirectWithStatus(req: NextRequest, status: string) {
  const res = NextResponse.redirect(buildAuthPageUrl(req, status))
  res.cookies.set(WECHAT_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}

export async function GET(req: NextRequest) {
  const config = getWeChatWebConfig()
  if (!config) return redirectWithStatus(req, 'not_configured')

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = req.cookies.get(WECHAT_STATE_COOKIE)?.value

  if (!code) return redirectWithStatus(req, 'missing_code')
  if (!state || !expectedState || state !== expectedState) {
    return redirectWithStatus(req, 'state_invalid')
  }

  try {
    const profile = await getWeChatWebProfile(config, code)
    const rawData = profile.rawData ? JSON.stringify(profile.rawData) : undefined

    let authAccount = await prisma.operatorAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: WECHAT_WEB_PROVIDER,
          providerUserId: profile.openid,
        },
      },
      include: { operator: true },
    })

    if (!authAccount && profile.unionid) {
      authAccount = await prisma.operatorAuthAccount.findFirst({
        where: {
          provider: WECHAT_WEB_PROVIDER,
          unionId: profile.unionid,
        },
        include: { operator: true },
      })
    }

    if (!authAccount) {
      const operatorCount = await prisma.operator.count()
      const isFirstOperator = operatorCount === 0
      const username = await createUniqueWeChatUsername(profile.openid)
      authAccount = await prisma.$transaction(async (tx) => {
        const operator = await tx.operator.create({
          data: {
            username,
            passwordHash: hashPassword(randomBytes(24).toString('hex')),
            name: profile.nickname || `微信用户${profile.openid.slice(-6)}`,
            role: isFirstOperator ? 'ADMIN' : 'OPERATOR',
            status: isFirstOperator ? 'ACTIVE' : 'PENDING',
            approvedAt: isFirstOperator ? new Date() : undefined,
          },
        })

        return tx.operatorAuthAccount.create({
          data: {
            provider: WECHAT_WEB_PROVIDER,
            providerUserId: profile.openid,
            unionId: profile.unionid,
            nickname: profile.nickname,
            avatarUrl: profile.avatarUrl,
            rawData,
            operatorId: operator.id,
          },
          include: { operator: true },
        })
      })

      if (!isFirstOperator) return redirectWithStatus(req, 'pending')
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

    const operator = authAccount.operator
    if (operator.status === 'PENDING') return redirectWithStatus(req, 'pending')
    if (operator.status === 'REJECTED') return redirectWithStatus(req, 'rejected')
    if (operator.status === 'DISABLED') return redirectWithStatus(req, 'disabled')

    const { token, expiresAt } = await createOperatorSession(operator.id)
    await prisma.operator.update({
      where: { id: operator.id },
      data: { lastLoginAt: new Date() },
    })

    const res = NextResponse.redirect(buildAuthPageUrl(req))
    setSessionCookie(res, token, expiresAt)
    res.cookies.set(WECHAT_STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return res
  } catch (error) {
    console.error('WeChat login callback error:', error)
    return redirectWithStatus(req, 'failed')
  }
}
