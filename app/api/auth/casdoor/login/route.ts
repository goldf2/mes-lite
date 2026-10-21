import type { NextRequest } from 'next/server'
import { casdoorLoginGet } from '@/modules/identity-access/http/casdoor-login-http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return casdoorLoginGet(request)
}
