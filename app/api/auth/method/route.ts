import { loginMethodGet } from '@/modules/identity-access/http/login-settings-http'

export const dynamic = 'force-dynamic'

export function GET() {
  return loginMethodGet()
}
