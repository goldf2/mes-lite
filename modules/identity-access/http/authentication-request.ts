import type { NextRequest } from 'next/server'
import { consumeAuthenticationThrottle } from '../server/authentication-throttle-service'

export type AuthenticationRequestScope = 'LOGIN' | 'REGISTER' | 'SETUP'

const authenticationRequestPolicies: Record<AuthenticationRequestScope, {
  limit: number
  windowMs: number
  blockMs: number
}> = {
  LOGIN: { limit: 30, windowMs: 5 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  REGISTER: { limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
  SETUP: { limit: 5, windowMs: 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 },
}

function lastForwardedAddress(value: string | null) {
  return value?.split(',').map((item) => item.trim()).filter(Boolean).at(-1) || ''
}

export function authenticationClientKeyFromHeaders(headers: Pick<Headers, 'get'>) {
  return headers.get('x-real-ip')?.trim()
    || lastForwardedAddress(headers.get('x-forwarded-for'))
    || `unknown:${(headers.get('user-agent') || 'no-user-agent').slice(0, 160)}`
}

export function authenticationClientKey(req: NextRequest) {
  return authenticationClientKeyFromHeaders(req.headers)
}

export async function enforceAuthenticationRequestLimit(
  req: NextRequest,
  scope: AuthenticationRequestScope,
) {
  await consumeAuthenticationThrottle({
    scope,
    clientKey: authenticationClientKey(req),
    ...authenticationRequestPolicies[scope],
  })
}
