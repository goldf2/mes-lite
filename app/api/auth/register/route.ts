import { NextRequest, NextResponse } from 'next/server'
import { registerInputSchema } from '@/modules/identity-access/contracts/authentication'
import { publicRegistrationEnabled } from '@/modules/identity-access/domain/authentication'
import { authenticationHttpError } from '@/modules/identity-access/http/authentication-http'
import { enforceAuthenticationRequestLimit } from '@/modules/identity-access/http/authentication-request'
import { registerOperator } from '@/modules/identity-access/server/authentication-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { data: { enabled: publicRegistrationEnabled() } },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  try {
    if (!publicRegistrationEnabled()) {
      return NextResponse.json({ error: '公开注册未启用，请联系管理员创建或开放账号' }, { status: 403 })
    }
    await enforceAuthenticationRequestLimit(req, 'REGISTER')
    const operator = await registerOperator(registerInputSchema.parse(await req.json()))
    return NextResponse.json({
      data: operator,
      message: '注册已提交，请等待管理员审核',
    }, { status: 201 })
  } catch (error) {
    return authenticationHttpError(error, '注册失败，请查看服务器日志')
  }
}
