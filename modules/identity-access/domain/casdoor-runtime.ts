import { createHash } from 'node:crypto'
import { environmentConfig, type CasdoorConnection } from '@oaktech/web-auth/casdoor-config'

export const MES_CASDOOR_CALLBACK = '/api/auth/casdoor/callback'
export const MES_AUTH_RUNTIME_KEY = 'authentication.runtime.v1'
export type LoginMode = 'builtin' | 'casdoor' | 'invalid'
export class CasdoorLoginError extends Error {
  constructor(public code: string, public status = 503) { super(code) }
}
/** Only complete, explicit origins are configuration: never paths, wildcards or credentials. */
export function parseCasdoorCallbackOrigin(value: string, production = process.env.NODE_ENV === 'production') {
  if (!value || /[\s\\*]/.test(value)) return null
  try {
    const url = new URL(value)
    if (!url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
      && (url.protocol === 'https:' || (!production && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return url.origin
  } catch { /* invalid explicit origin fails closed */ }
  return null
}
export function readLoginConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const mode: LoginMode = env.APP_LOGIN_MODE === undefined || env.APP_LOGIN_MODE === 'builtin'
    ? 'builtin' : env.APP_LOGIN_MODE === 'casdoor' ? 'casdoor' : 'invalid'
  const rawOrigin = env.APP_ORIGIN || env.MES_PUBLIC_BASE_URL || ''
  const origin = parseCasdoorCallbackOrigin(rawOrigin, env.NODE_ENV === 'production')
  const aliases = (env.APP_AUTH_CALLBACK_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  const parsedAliases = aliases.map(value => parseCasdoorCallbackOrigin(value, env.NODE_ENV === 'production'))
  const callbackOrigins = Array.from(new Set([origin, ...parsedAliases].filter((value): value is string => Boolean(value))))
  const callbackOriginsValid = parsedAliases.every(Boolean)
  let connection: CasdoorConnection | null = null
  try { if (mode === 'casdoor') connection = environmentConfig(env) } catch { /* never fall back to builtin */ }
  const ready = mode === 'builtin' || (mode === 'casdoor' && Boolean(origin && connection && callbackOriginsValid))
  const fields = mode === 'builtin' ? ['builtin'] : [mode, rawOrigin, ...[
    'CASDOOR_ISSUER', 'CASDOOR_CLIENT_ID', 'CASDOOR_CLIENT_SECRET', 'CASDOOR_APPLICATION',
    'CASDOOR_ORGANIZATION', 'CASDOOR_DISCOVERY_URL', 'CASDOOR_SCOPES', 'APP_AUTH_ALLOWED_TARGETS',
  ].map(key => env[key] || '')]
  const fingerprint = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
  // Aliases affect individual login attempts, not identity/session generations.
  return { mode, ready, origin, callbackOrigins, connection, fingerprint }
}
export function requireCasdoorCallbackOrigin(config: Pick<ReturnType<typeof readLoginConfiguration>, 'callbackOrigins'>, value: string) {
  const origin = parseCasdoorCallbackOrigin(value)
  if (!origin || !config.callbackOrigins.includes(origin)) throw new CasdoorLoginError('INVALID_CALLBACK_ORIGIN', 403)
  return origin
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
