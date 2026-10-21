import { loginSettingsGet } from '@/modules/identity-access/http/login-settings-http'

export const dynamic = 'force-dynamic'

export async function GET() {
  return loginSettingsGet()
}
