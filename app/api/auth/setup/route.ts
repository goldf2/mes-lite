import { NextRequest, NextResponse } from 'next/server'
import { initialAdministratorInputSchema } from '@/modules/identity-access/contracts/authentication'
import { authenticationHttpError } from '@/modules/identity-access/http/authentication-http'
import { enforceAuthenticationRequestLimit } from '@/modules/identity-access/http/authentication-request'
import {
  installInitialAdministrator,
  verifyInitialAdministratorToken,
} from '@/modules/identity-access/server/authentication-service'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-mes-initial-admin-token')
    verifyInitialAdministratorToken(token)
    await enforceAuthenticationRequestLimit(req, 'SETUP')
    const operator = await installInitialAdministrator(
      initialAdministratorInputSchema.parse(await req.json()),
      token,
    )
    return NextResponse.json({ data: operator, message: '初始管理员安装成功，请立即移除安装令牌' }, { status: 201 })
  } catch (error) {
    return authenticationHttpError(error, '管理员安装失败')
  }
}
