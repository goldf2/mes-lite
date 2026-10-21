import type { NextRequest } from 'next/server'
import { nativeAdminLoginPost } from '@/modules/identity-access/http/native-admin-login-http'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return nativeAdminLoginPost(request)
}
