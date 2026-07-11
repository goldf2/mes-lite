import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { clearSessionCookie, SESSION_COOKIE } from '@/lib/auth'

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) {
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await prisma.operatorSession.deleteMany({ where: { tokenHash } })
  }
  const res = NextResponse.json({ success: true, message: '已退出' })
  clearSessionCookie(res)
  return res
}
