import type { NextRequest } from 'next/server'
import { nativeAdminLoginPost } from '@/modules/identity-access/http/native-admin-login-http'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // audit-covered-by: nativeAdminLoginPost
  // The shared HTTP adapter records LOGIN with writeAuditLogWithContext before returning the session.
  return nativeAdminLoginPost(request)
}
