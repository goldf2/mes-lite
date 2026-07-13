import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'

export const WECHAT_WEB_PROVIDER = 'WECHAT_WEB'
export const WECHAT_STATE_COOKIE = 'mes_lite_wechat_state'

export interface WeChatWebConfig {
  appId: string
  appSecret: string
  redirectUri?: string
}

interface WeChatTokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  openid?: string
  scope?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

export interface WeChatUserProfile {
  openid: string
  unionid?: string
  nickname?: string
  avatarUrl?: string
  rawData?: unknown
}

interface WeChatUserInfoResponse {
  openid?: string
  nickname?: string
  sex?: number
  province?: string
  city?: string
  country?: string
  headimgurl?: string
  privilege?: string[]
  unionid?: string
  errcode?: number
  errmsg?: string
}

export function getWeChatWebConfig(): WeChatWebConfig | null {
  const appId = process.env.WECHAT_WEB_APP_ID?.trim()
  const appSecret = process.env.WECHAT_WEB_APP_SECRET?.trim()
  const redirectUri = process.env.WECHAT_WEB_REDIRECT_URI?.trim()

  if (!appId || !appSecret) return null
  return { appId, appSecret, redirectUri: redirectUri || undefined }
}

export function getWeChatRedirectUri(req: NextRequest, config: WeChatWebConfig) {
  if (config.redirectUri) return config.redirectUri
  return new URL('/api/auth/wechat/callback', req.url).toString()
}

export function createWeChatState() {
  return randomBytes(16).toString('hex')
}

export function buildWeChatAuthorizeUrl(config: WeChatWebConfig, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    appid: config.appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  })

  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`
}

export function buildAuthPageUrl(req: NextRequest, status?: string) {
  const url = new URL('/', req.url)
  if (status) url.searchParams.set('wechat_login', status)
  return url
}

function toSafeWeChatRawData(tokenData: WeChatTokenResponse, userInfo?: WeChatUserInfoResponse) {
  return {
    token: {
      openid: tokenData.openid,
      unionid: tokenData.unionid,
      scope: tokenData.scope,
      expiresIn: tokenData.expires_in,
    },
    userInfo: userInfo
      ? {
          openid: userInfo.openid,
          unionid: userInfo.unionid,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.headimgurl,
          province: userInfo.province,
          city: userInfo.city,
          country: userInfo.country,
          sex: userInfo.sex,
        }
      : undefined,
  }
}

async function readWeChatJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`WeChat request failed: ${res.status}`)
  }
  return data as T
}

export async function getWeChatWebProfile(config: WeChatWebConfig, code: string): Promise<WeChatUserProfile> {
  const tokenParams = new URLSearchParams({
    appid: config.appId,
    secret: config.appSecret,
    code,
    grant_type: 'authorization_code',
  })
  const tokenData = await readWeChatJson<WeChatTokenResponse>(
    `https://api.weixin.qq.com/sns/oauth2/access_token?${tokenParams.toString()}`
  )

  if (tokenData.errcode || !tokenData.openid || !tokenData.access_token) {
    throw new Error(tokenData.errmsg || 'WeChat token exchange failed')
  }

  const userInfoParams = new URLSearchParams({
    access_token: tokenData.access_token,
    openid: tokenData.openid,
    lang: 'zh_CN',
  })
  const userInfo = await readWeChatJson<WeChatUserInfoResponse>(
    `https://api.weixin.qq.com/sns/userinfo?${userInfoParams.toString()}`
  )

  if (userInfo.errcode) {
    return {
      openid: tokenData.openid,
      unionid: tokenData.unionid,
      rawData: toSafeWeChatRawData(tokenData),
    }
  }

  return {
    openid: userInfo.openid || tokenData.openid,
    unionid: userInfo.unionid || tokenData.unionid,
    nickname: userInfo.nickname,
    avatarUrl: userInfo.headimgurl,
    rawData: toSafeWeChatRawData(tokenData, userInfo),
  }
}
