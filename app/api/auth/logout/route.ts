import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { clearSessionCookie, SESSION_COOKIE } from '@/lib/auth'
import { revokeOperatorSession } from '@/modules/identity-access/server/authentication-service'

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) await revokeOperatorSession(token)
  const response = NextResponse.json({ success: true, message: '已退出' })
  clearSessionCookie(response)
  return response
}
