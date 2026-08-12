import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthenticationError } from '../domain/authentication'

export function authenticationHttpError(error: unknown, fallback = '认证失败') {
  if (error instanceof z.ZodError) return NextResponse.json({
    error: error.errors[0]?.message || '参数错误', details: error.errors,
  }, { status: 400 })
  if (error instanceof AuthenticationError) return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
    },
  )
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = error.code === 'P2002' ? '账号已存在'
      : error.code === 'P2021' || error.code === 'P2022' ? '数据库结构未初始化，请先执行迁移'
      : `数据库操作失败（${error.code}）`
    return NextResponse.json({ error: message }, { status: error.code === 'P2002' ? 400 : 500 })
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/readonly|read-only|permission denied|unable to open database file|attempt to write a readonly database/i.test(message)) return NextResponse.json({ error: '数据库不可写，请检查服务器持久化目录权限' }, { status: 500 })
  if (/no such table|no such column|table .* does not exist|column .* does not exist/i.test(message)) return NextResponse.json({ error: '数据库结构未初始化，请先执行迁移' }, { status: 500 })
  if (/database is locked|busy|timeout/i.test(message)) return NextResponse.json({ error: '数据库正被占用，请稍后重试' }, { status: 500 })
  if (/disk I\/O|no space left|database disk image is malformed/i.test(message)) return NextResponse.json({ error: '数据库文件或磁盘异常，请检查服务器存储' }, { status: 500 })
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
