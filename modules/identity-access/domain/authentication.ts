export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export const PASSWORD_FAILURE_LIMIT = 5
export const PASSWORD_FAILURE_WINDOW_MS = 15 * 60 * 1000
export const PASSWORD_LOCK_MS = 15 * 60 * 1000

export function publicRegistrationEnabled() {
  return process.env.MES_PUBLIC_REGISTRATION_ENABLED?.trim().toLowerCase() === 'true'
}

export function operatorLoginStatusError(status: string) {
  if (status === 'PENDING') return new AuthenticationError('账号待审核，请联系管理员', 403)
  if (status === 'REJECTED') return new AuthenticationError('账号审核未通过', 403)
  if (status === 'DISABLED') return new AuthenticationError('账号已停用', 403)
  return null
}

export function weChatUsernameBase(openid: string, fallback: string) {
  return `wx_${openid.replace(/[^a-zA-Z0-9]/g, '').slice(-16) || fallback}`.slice(0, 28)
}
