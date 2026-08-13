import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import { DataScopeError } from '@/modules/identity-access'

export function productionOrderHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({
      error: error.errors[0]?.message || '参数错误',
      details: error.errors,
    }, { status: 400 })
  }
  if (error instanceof ProductionOrderDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof DataScopeError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
