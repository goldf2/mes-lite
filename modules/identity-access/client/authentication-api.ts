import { logoutCasdoorBrowser } from '@oaktech/web-auth/browser-logout'

async function readJson(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: string; message?: string }
  if (!response.ok) throw new Error(payload.error || fallback)
  return payload
}

export async function loadCurrentOperator<T>() {
  const response = await fetch('/api/auth/me')
  if (!response.ok) return null
  return (await readJson(response, '读取当前账号失败')).data as T
}

export class ProviderLogoutError extends Error {
  constructor() { super('统一账号退出未完成，请重试。') }
}

export async function logoutOperator(onLocalRevoked?: () => void) {
  const payload = await readJson(await fetch('/api/auth/logout', { method: 'POST' }), '退出登录失败') as { providerLogoutIssuer?: unknown; handoffUrl?: unknown }
  // Revoke the visible local identity even if the identity provider is unavailable.
  onLocalRevoked?.()
  if (payload.handoffUrl !== null && payload.handoffUrl !== undefined) {
    if (payload.handoffUrl !== '/api/auth/casdoor/logout') throw new ProviderLogoutError()
    return {providerConfirmed: false, handoffUrl: payload.handoffUrl}
  }
  if (payload.providerLogoutIssuer === null || payload.providerLogoutIssuer === undefined) return { providerConfirmed: false, handoffUrl: null }
  if (typeof payload.providerLogoutIssuer !== 'string') throw new ProviderLogoutError()
  try { await logoutCasdoorBrowser(payload.providerLogoutIssuer) } catch { throw new ProviderLogoutError() }
  return { providerConfirmed: true, handoffUrl: null }
}

export async function loginOperator(input: { username: string; password: string }) {
  await readJson(await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), '登录失败')
}

export async function registerOperatorAccount(input: { username: string; password: string; name: string; phone: string }) {
  return readJson(await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), '注册失败')
}

export async function loadPublicRegistrationEnabled() {
  const response = await fetch('/api/auth/register')
  if (!response.ok) return false
  const payload = await response.json() as { data?: { enabled?: boolean } }
  return Boolean(payload.data?.enabled)
}

export async function loadWeChatLoginEnabled() {
  const response = await fetch('/api/auth/wechat/status')
  if (!response.ok) return false
  const payload = await response.json() as { data?: { enabled?: boolean } }
  return Boolean(payload.data?.enabled)
}

export type PublicLoginMethod = {
  mode: 'builtin' | 'casdoor' | 'invalid'
  ready: boolean
  settingsHref: '/settings/login'
  recoveryHref: '/admin-login'
}
export async function loadLoginMethod(): Promise<PublicLoginMethod> {
  const response = await fetch('/api/auth/method', {cache: 'no-store'})
  const payload = await response.json().catch(() => null) as {data?: PublicLoginMethod}|null
  const data = payload?.data
  if (!data || !['builtin', 'casdoor', 'invalid'].includes(data.mode) || typeof data.ready !== 'boolean' || data.settingsHref !== '/settings/login' || data.recoveryHref !== '/admin-login' || (!response.ok && response.status !== 503)) throw new Error('登录配置暂时无法读取')
  return data
}
export async function loginNativeAdministrator(input: {username: string; password: string}) {
  await readJson(await fetch('/api/auth/native-admin/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input),
  }), '管理员登录失败')
}
