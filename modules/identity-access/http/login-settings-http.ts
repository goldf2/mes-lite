import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { loginSettingsDiagnostics, publicLoginMethod } from '../server/login-settings-service'

const headers = { 'Cache-Control': 'no-store' }
export function loginMethodGet() {
  const method = publicLoginMethod()
  return NextResponse.json({ data: method }, { status: method.ready ? 200 : 503, headers })
}
export async function loginSettingsGet() {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: 'LOGIN_REQUIRED' }, { status: 401, headers })
  if (operator.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  return NextResponse.json({ data: loginSettingsDiagnostics() }, { headers })
}
