import { createHash } from 'node:crypto'
import { environmentConfig, type CasdoorConnection } from '@oaktech/web-auth/casdoor-config'

export const MES_CASDOOR_CALLBACK = '/api/auth/casdoor/callback'
export const MES_AUTH_RUNTIME_KEY = 'authentication.runtime.v1'
export type LoginMode = 'builtin' | 'casdoor' | 'invalid'
export class CasdoorLoginError extends Error {
  constructor(public code: string, public status = 503) { super(code) }
}
export function readLoginConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const mode: LoginMode = env.APP_LOGIN_MODE === undefined || env.APP_LOGIN_MODE === 'builtin'
    ? 'builtin' : env.APP_LOGIN_MODE === 'casdoor' ? 'casdoor' : 'invalid'
  let origin: string | null = null
  const rawOrigin = env.APP_ORIGIN || env.MES_PUBLIC_BASE_URL || ''
  try {
    const url = new URL(rawOrigin)
    if (!url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
      && (url.protocol === 'https:' || (env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) origin = url.origin
  } catch { /* readiness remains false for explicitly selected Casdoor */ }
  let connection: CasdoorConnection | null = null
  try { if (mode === 'casdoor') connection = environmentConfig(env) } catch { /* never fall back to builtin */ }
  const ready = mode === 'builtin' || (mode === 'casdoor' && Boolean(origin && connection))
  const fields = mode === 'builtin' ? ['builtin'] : [mode, rawOrigin, ...[
    'CASDOOR_ISSUER', 'CASDOOR_CLIENT_ID', 'CASDOOR_CLIENT_SECRET', 'CASDOOR_APPLICATION',
    'CASDOOR_ORGANIZATION', 'CASDOOR_DISCOVERY_URL', 'CASDOOR_SCOPES', 'APP_AUTH_ALLOWED_TARGETS',
  ].map(key => env[key] || '')]
  const fingerprint = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
  return { mode, ready, origin, connection, fingerprint }
}
export function safeLoginReturn(value: unknown) {
  if (typeof value !== 'string' || value.length > 1500 || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u001f\u007f]/.test(value)) return '/'
  try {
    const url = new URL(value, 'https://mes.return.invalid')
    if (url.origin !== 'https://mes.return.invalid' || url.pathname.startsWith('/api/auth/')) return '/'
    return url.pathname + url.search + url.hash
  } catch { return '/' }
}
export const casdoorProvider = (issuer: string) => 'oidc:' + issuer
