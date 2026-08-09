import { NextRequest, NextResponse } from 'next/server'
import { registerInputSchema } from '@/modules/identity-access/contracts/authentication'
import { authenticationHttpError } from '@/modules/identity-access/http/authentication-http'
import { registerOperator } from '@/modules/identity-access/server/authentication-service'

export async function POST(req: NextRequest) {
  try {
    const { operator, isFirstOperator } = await registerOperator(registerInputSchema.parse(await req.json()))
    return NextResponse.json({
      data: operator,
      message: isFirstOperator ? '首位操作人员已自动设为管理员，请登录' : '注册已提交，请等待审核',
    }, { status: 201 })
  } catch (error) {
    return authenticationHttpError(error, '注册失败，请查看服务器日志')
  }
}
