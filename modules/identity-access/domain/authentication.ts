export class AuthenticationError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 403) {
    super(message)
    this.name = 'AuthenticationError'
  }
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
