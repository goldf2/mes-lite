import { prisma } from '@/lib/prisma'
import { casdoorProvider } from '../domain/casdoor-runtime'
import { ensureAuthenticationRuntime } from './authentication-runtime-service'

export interface SessionAuthentication {
  authSource: string
  authAccountId: string | null
  authSubject: string | null
  authGeneration: string | null
  operatorId: string
}
export async function sessionAuthenticationAllowed(session: SessionAuthentication, operator: { role: string; status: string }) {
  if (operator.status !== 'ACTIVE') return false
  const runtime = await ensureAuthenticationRuntime()
  if (session.authSource === 'native-admin-recovery') return operator.role === 'ADMIN'
  if (session.authSource === 'casdoor') {
    if (runtime.mode !== 'casdoor' || !runtime.ready || !runtime.connection || !session.authAccountId || !session.authSubject
      || session.authGeneration !== runtime.state.generation) return false
    const binding = await prisma.operatorAuthAccount.findUnique({ where: { id: session.authAccountId }, select: { operatorId: true, provider: true, providerUserId: true } })
    return Boolean(binding && binding.operatorId === session.operatorId && binding.provider === casdoorProvider(runtime.connection.issuer) && binding.providerUserId === session.authSubject)
  }
  return runtime.mode === 'builtin' && ['native', 'wechat'].includes(session.authSource)
    && (session.authGeneration === runtime.state.generation || (session.authGeneration === null && runtime.state.legacyAllowed))
}
