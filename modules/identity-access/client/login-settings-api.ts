export type LoginSettingsDiagnostics = {
  mode: 'builtin'|'casdoor'|'invalid'
  ready: boolean
  source: 'runtime'
  issuer: string|null
  clientId: string|null
  application: string|null
  organization: string|null
  callbackUrl: string|null
  clientSecretConfigured: boolean
  bindingPolicy: 'explicit-existing-active-operator'
  localRecovery: 'existing-active-admin-password'
  sessionLogout: 'current-browser-casdoor'
}
export class LoginSettingsReadError extends Error {
  constructor(public status: number) {super(status === 401 ? '请先登录，管理员可查看连接参数。' : status === 403 ? '当前账号不能查看管理员连接参数。' : '登录设置暂时无法读取。')}
}
export async function loadLoginSettings(): Promise<LoginSettingsDiagnostics> {
  const response = await fetch('/api/system/login-settings', {cache:'no-store'})
  if (!response.ok) throw new LoginSettingsReadError(response.status)
  const payload = await response.json().catch(() => null) as {data?: LoginSettingsDiagnostics}|null
  const data = payload?.data
  if (!data || !['builtin','casdoor','invalid'].includes(data.mode) || typeof data.ready !== 'boolean' || data.source !== 'runtime' || typeof data.clientSecretConfigured !== 'boolean' || data.bindingPolicy !== 'explicit-existing-active-operator' || data.localRecovery !== 'existing-active-admin-password' || data.sessionLogout !== 'current-browser-casdoor') throw new LoginSettingsReadError(503)
  for (const field of ['issuer','clientId','application','organization','callbackUrl'] as const) if (data[field] !== null && typeof data[field] !== 'string') throw new LoginSettingsReadError(503)
  return {mode:data.mode,ready:data.ready,source:'runtime',issuer:data.issuer,clientId:data.clientId,application:data.application,organization:data.organization,callbackUrl:data.callbackUrl,clientSecretConfigured:data.clientSecretConfigured,bindingPolicy:data.bindingPolicy,localRecovery:data.localRecovery,sessionLogout:data.sessionLogout}
}
