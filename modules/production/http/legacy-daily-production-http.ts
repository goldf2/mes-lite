import { NextResponse } from 'next/server'
import { z } from 'zod'
import { LegacyDailyProductionError } from '../domain/legacy-daily-production-errors'

export function legacyDailyProductionHttpError(
  error: unknown,
  fallback: string,
  includeValidationDetails = false,
) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({
      error: error.errors[0]?.message || '参数错误',
      ...(includeValidationDetails ? { details: error.errors } : {}),
    }, { status: 400 })
  }
  if (error instanceof LegacyDailyProductionError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
