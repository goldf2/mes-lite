import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { QualityInspectionDomainError } from '../domain/quality-inspection-errors'

export function qualityHttpError(error: unknown, fallback: string) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || '输入不合法' }, { status: 400 })
  if (error instanceof QualityInspectionDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: '编码或生效范围重复' }, { status: 409 })
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
