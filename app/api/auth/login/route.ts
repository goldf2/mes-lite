import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/lib/auth'
import { loginInputSchema } from '@/modules/identity-access/contracts/authentication'
import { authenticationHttpError } from '@/modules/identity-access/http/authentication-http'
import { enforceAuthenticationRequestLimit } from '@/modules/identity-access/http/authentication-request'
import { loginWithPassword } from '@/modules/identity-access/server/authentication-service'

export async function POST(req: NextRequest) {
  try {
    await enforceAuthenticationRequestLimit(req, 'LOGIN')
    const { operator, session } = await loginWithPassword(loginInputSchema.parse(await req.json()))
    const response = NextResponse.json({ data: operator, message: '登录成功' })
    setSessionCookie(response, session.token, session.expiresAt)
    return response
  } catch (error) {
    return authenticationHttpError(error, '登录失败')
  }
}
