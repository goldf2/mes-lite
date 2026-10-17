import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { MES_CASDOOR_LOGOUT_CALLBACK } from '../domain/casdoor-runtime'
import type { CasdoorConnection } from '@oaktech/web-auth/casdoor-config'

export const CASDOOR_LOGOUT_PATH = '/api/auth/casdoor/logout'
export const CASDOOR_HINT_COOKIES = ['mes_lite_oidc_hint_0', 'mes_lite_oidc_hint_1', 'mes_lite_oidc_hint_2'] as const
export const CASDOOR_HANDOFF_COOKIES = ['mes_lite_oidc_logout_0', 'mes_lite_oidc_logout_1', 'mes_lite_oidc_logout_2'] as const
export const CASDOOR_LOGOUT_STATE_COOKIE = 'mes_lite_oidc_logout_state'
export const LOGOUT_COOKIE_PART_LIMIT = 3000
const MAX_SEALED_LENGTH = 3 * (LOGOUT_COOKIE_PART_LIMIT - 2)
const MAX_ID_TOKEN_LENGTH = 6000
const MAX_SESSION_MS = 7 * 86400_000
const HANDOFF_MS = 120_000
type Cookies = { get(name: string): {value: string}|undefined }
export type LogoutConnection = {origin: string; issuer: string; clientId: string; clientSecret: string; generation: string}
type Hint = {idToken: string; expiresAt: number; sessionHash: string}
type Handoff = {idToken: string; expiresAt: number; state: string}
const invalid = (): never => { throw new Error('CASDOOR_LOGOUT_UNCONFIRMED') }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const tokenValid = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_ID_TOKEN_LENGTH && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
export function requireCasdoorLogoutToken(value: unknown): asserts value is string {if (!tokenValid(value)) invalid()}
export function casdoorLogoutConnection(runtime: {mode: string; ready: boolean; origin: string|null; connection: CasdoorConnection|null; state: {generation: string}}): LogoutConnection|null {
  if (runtime.mode !== 'casdoor' || !runtime.ready || !runtime.origin || !runtime.connection) return null
  return {origin: runtime.origin, issuer: runtime.connection.issuer, clientId: runtime.connection.clientId, clientSecret: runtime.connection.clientSecret, generation: runtime.state.generation}
}
function associatedData(config: LogoutConnection, purpose: string, sessionHash = '') {
  return Buffer.from(JSON.stringify(['mes-casdoor-logout-v2', purpose, config.origin, config.issuer, config.clientId, config.generation, sessionHash]))
}
function encryptionKey(config: LogoutConnection, purpose: string) {
  if (!config.clientSecret || !config.generation || !config.clientId) return invalid()
  return Buffer.from(hkdfSync('sha256', config.clientSecret, config.issuer, 'mes-lite/casdoor/logout/v2/' + purpose, 32))
}
function seal(config: LogoutConnection, purpose: string, value: object, sessionHash = '') {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(config, purpose), iv)
  cipher.setAAD(associatedData(config, purpose, sessionHash))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const result = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
  if (result.length > MAX_SEALED_LENGTH) return invalid()
  return result
}
function open(config: LogoutConnection, purpose: string, value: string, sessionHash = ''): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]{40,8994}$/.test(value)) return invalid()
  try {
    const data = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(config, purpose), data.subarray(0, 12))
    decipher.setAuthTag(data.subarray(12, 28)); decipher.setAAD(associatedData(config, purpose, sessionHash))
    const result = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) return invalid()
    return result
  } catch {return invalid()}
}
export function splitLogoutCookie(value: string) {
  if (!value || value.length > MAX_SEALED_LENGTH) return invalid()
  const size = LOGOUT_COOKIE_PART_LIMIT - 2, count = Math.ceil(value.length / size)
  return Array.from({length: count}, (_, i) => count + '.' + value.slice(i * size, (i + 1) * size))
}
export function readLogoutCookie(cookies: Cookies, names: readonly string[]) {
  const first = cookies.get(names[0])?.value || ''
  if (!/^[1-3]\.[A-Za-z0-9_-]+$/.test(first)) return invalid()
  const count = Number(first[0]); let result = ''
  for (let i = 0; i < names.length; i++) {
    const value = cookies.get(names[i])?.value || ''
    if (i >= count) {if (value) return invalid(); continue}
    if (value.length > LOGOUT_COOKIE_PART_LIMIT || !value.startsWith(count + '.') || !/^[A-Za-z0-9_-]+$/.test(value.slice(2))) return invalid()
    result += value.slice(2)
  }
  if (result.length > MAX_SEALED_LENGTH) return invalid()
  return result
}
/** Only call after normal signature/issuer/audience/nonce validation and native session creation. */
export function sealCasdoorLogoutHint(config: LogoutConnection, idToken: string, sessionToken: string, expiresAt: Date, now = Date.now()) {
  if (!tokenValid(idToken) || !sessionToken || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now || expiresAt.getTime() > now + MAX_SESSION_MS + 60_000) return invalid()
  const sessionHash = hash(sessionToken)
  return splitLogoutCookie(seal(config, 'hint', {idToken, expiresAt: expiresAt.getTime(), sessionHash}, sessionHash))
}
export function readCasdoorLogoutHint(config: LogoutConnection, cookies: Cookies, sessionToken: string, sessionExpiresAt: Date, now = Date.now()): Hint|null {
  try {
    const sessionHash = hash(sessionToken), hint = open(config, 'hint', readLogoutCookie(cookies, CASDOOR_HINT_COOKIES), sessionHash)
    if (!tokenValid(hint.idToken) || hint.sessionHash !== sessionHash || hint.expiresAt !== sessionExpiresAt.getTime()
      || !Number.isSafeInteger(hint.expiresAt) || Number(hint.expiresAt) <= now || Number(hint.expiresAt) > now + MAX_SESSION_MS + 60_000) return null
    return hint as Hint
  } catch {return null}
}
export function createCasdoorLogoutHandoff(config: LogoutConnection, hint: Hint, now = Date.now()) {
  if (!tokenValid(hint.idToken) || hint.expiresAt <= now) return invalid()
  const state = randomBytes(32).toString('base64url'), expiresAt = now + HANDOFF_MS
  return {
    parts: splitLogoutCookie(seal(config, 'handoff', {idToken: hint.idToken, state, expiresAt})),
    stateCookie: seal(config, 'state', {state, expiresAt}),
  }
}
function readState(config: LogoutConnection, value: string, now: number) {
  const state = open(config, 'state', value)
  if (typeof state.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state.state) || !Number.isSafeInteger(state.expiresAt)
    || Number(state.expiresAt) <= now || Number(state.expiresAt) > now + HANDOFF_MS) return invalid()
  return state as {state: string; expiresAt: number}
}
export function readCasdoorLogoutHandoff(config: LogoutConnection, cookies: Cookies, now = Date.now()) {
  const state = readState(config, cookies.get(CASDOOR_LOGOUT_STATE_COOKIE)?.value || '', now)
  const handoff = open(config, 'handoff', readLogoutCookie(cookies, CASDOOR_HANDOFF_COOKIES))
  if (!tokenValid(handoff.idToken) || handoff.state !== state.state || handoff.expiresAt !== state.expiresAt) return invalid()
  return handoff as Handoff
}
export function validateCasdoorLogoutCallback(config: LogoutConnection, stateCookie: string, incoming: URLSearchParams, now = Date.now()) {
  if (incoming.size !== 1 || incoming.getAll('state').length !== 1) return false
  try {
    const expected = readState(config, stateCookie, now).state, actual = incoming.get('state') || ''
    return /^[A-Za-z0-9_-]{43}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  } catch {return false}
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function casdoorLogoutForm(config: LogoutConnection, handoff: Handoff) {
  const nonce = randomBytes(24).toString('base64'), action = new URL('/api/logout', config.issuer).href
  const fields = {id_token_hint: handoff.idToken, client_id: config.clientId, post_logout_redirect_uri: config.origin + MES_CASDOOR_LOGOUT_CALLBACK, state: handoff.state}
  const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>退出统一账号</title><body><p>MES 已退出，正在退出身份中心。</p><form id="logout" method="post" action="' + escapeHtml(action) + '">' + Object.entries(fields).map(([name, value]) => '<input type="hidden" name="' + name + '" value="' + escapeHtml(value) + '">').join('') + '<button type="submit">继续退出统一账号</button></form><script nonce="' + nonce + '">document.getElementById("logout").submit()</script></body></html>'
  return {html, csp: "default-src 'none'; script-src 'nonce-" + nonce + "'; form-action 'self' " + config.issuer + "; base-uri 'none'; frame-ancestors 'none'"}
}
