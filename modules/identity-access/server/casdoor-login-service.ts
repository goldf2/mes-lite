import { createHash, randomBytes } from 'node:crypto'
import * as oidc from 'openid-client'
import { createCasdoorOidcConfiguration, type OidcNetworkOptions } from '@oaktech/web-auth/casdoor-oidc'
import { prisma } from '@/lib/prisma'
import { CasdoorLoginError, MES_CASDOOR_CALLBACK, casdoorProvider, safeLoginReturn } from '../domain/casdoor-runtime'
import { startOperatorSession } from './authentication-service'
import { ensureAuthenticationRuntime } from './authentication-runtime-service'

export const CASDOOR_CHALLENGE_COOKIE = 'mes_lite_casdoor_challenge'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
async function configuration(network: OidcNetworkOptions = {}) {
  const runtime = await ensureAuthenticationRuntime()
  if (runtime.mode !== 'casdoor' || !runtime.ready || !runtime.connection || !runtime.origin) throw new CasdoorLoginError('CASDOOR_UNAVAILABLE')
  const config = await createCasdoorOidcConfiguration(runtime.connection, { allowedTargets: process.env.APP_AUTH_ALLOWED_TARGETS, ...network })
  return { runtime, config }
}
export async function beginCasdoorLogin(next?: unknown, network: OidcNetworkOptions = {}) {
  const { runtime, config } = await configuration(network)
  const ticket = randomBytes(32).toString('hex')
  const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce()
  const current = await ensureAuthenticationRuntime()
  if (current.state.generation !== runtime.state.generation) throw new CasdoorLoginError('LOGIN_CONFIGURATION_CHANGED', 409)
  const expiresAt = new Date(Date.now() + 5 * 60_000)
  await prisma.operatorLoginChallenge.deleteMany({ where: { expiresAt: { lte: new Date() } } })
  await prisma.operatorLoginChallenge.create({ data: {
    ticketHash: digest(ticket), verifier, state, nonce, generation: runtime.state.generation,
    returnPath: safeLoginReturn(next), expiresAt,
  } })
  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: runtime.origin + MES_CASDOOR_CALLBACK, scope: runtime.connection!.scopes,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce,
  })
  return { authorizationUrl: authorizationUrl.href, ticket, expiresAt }
}
export async function completeCasdoorLogin(requestUrl: string, ticket: string, network: OidcNetworkOptions = {}) {
  if (!/^[0-9a-f]{64}$/.test(ticket)) throw new CasdoorLoginError('LOGIN_EXPIRED', 401)
  const pending = await prisma.$transaction(async tx => {
    const row = await tx.operatorLoginChallenge.findUnique({ where: { ticketHash: digest(ticket) } })
    const consumed = await tx.operatorLoginChallenge.updateMany({
      where: { ticketHash: digest(ticket), consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() },
    })
    return row && consumed.count === 1 ? row : null
  })
  if (!pending) throw new CasdoorLoginError('LOGIN_EXPIRED', 401)
  const { runtime, config } = await configuration(network)
  if (pending.generation !== runtime.state.generation) throw new CasdoorLoginError('LOGIN_CONFIGURATION_CHANGED', 401)
  const incoming = new URL(requestUrl)
  if (incoming.pathname !== MES_CASDOOR_CALLBACK) throw new CasdoorLoginError('INVALID_CALLBACK', 401)
  const callback = new URL(runtime.origin! + MES_CASDOOR_CALLBACK)
  callback.search = incoming.search
  const tokens = await oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: pending.verifier, expectedState: pending.state, expectedNonce: pending.nonce, idTokenExpected: true,
  })
  const claims = tokens.claims()
  if (!claims || claims.iss !== runtime.connection!.issuer || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 512) throw new CasdoorLoginError('INVALID_IDENTITY', 401)
  const binding = await prisma.operatorAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: casdoorProvider(claims.iss), providerUserId: claims.sub } },
    include: { operator: true },
  })
  if (!binding) throw new CasdoorLoginError('CASDOOR_BINDING_REQUIRED', 403)
  if (binding.operator.status !== 'ACTIVE') throw new CasdoorLoginError('OPERATOR_NOT_ACTIVE', 403)
  const current = await ensureAuthenticationRuntime()
  if (current.state.generation !== pending.generation) throw new CasdoorLoginError('LOGIN_CONFIGURATION_CHANGED', 401)
  const session = await startOperatorSession(binding.operator, {
    authSource: 'casdoor', authAccountId: binding.id, authSubject: claims.sub, authGeneration: pending.generation, challengeTicketHash: pending.ticketHash,
  })
  return { session, operatorId: binding.operator.id, operatorName: binding.operator.name, operatorUsername: binding.operator.username, next: safeLoginReturn(pending.returnPath) }
}

/** Revoke only this browser attempt, including a callback session created before logout wins the transaction. */
export async function revokeCasdoorBrowserAttempt(ticket: string) {
  if (!/^[0-9a-f]{64}$/.test(ticket)) return
  await prisma.$transaction(async tx => {
    const attempt = await tx.operatorLoginChallenge.findUnique({ where: { ticketHash: digest(ticket) } })
    if (attempt?.sessionId) await tx.operatorSession.deleteMany({ where: { id: attempt.sessionId } })
    await tx.operatorLoginChallenge.deleteMany({ where: { ticketHash: digest(ticket) } })
  })
}
