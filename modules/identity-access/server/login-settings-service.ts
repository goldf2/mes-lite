import { readLoginConfiguration, MES_CASDOOR_CALLBACK } from '../domain/casdoor-runtime'

export function publicLoginMethod() {
  const config = readLoginConfiguration()
  return { mode: config.mode, ready: config.ready, settingsHref: '/settings/login', recoveryHref: '/admin-login' }
}
export function loginSettingsDiagnostics() {
  const config = readLoginConfiguration(), connection = config.connection
  return {
    mode: config.mode, ready: config.ready, source: 'runtime' as const,
    issuer: connection?.issuer || null, clientId: connection?.clientId || null,
    application: connection?.application || null, organization: connection?.organization || null,
    callbackUrl: config.origin ? config.origin + MES_CASDOOR_CALLBACK : null,
    clientSecretConfigured: Boolean(process.env.CASDOOR_CLIENT_SECRET),
    bindingPolicy: 'explicit-existing-active-operator', localRecovery: 'existing-active-admin-password',
    sessionLogout: 'local-only',
  }
}
