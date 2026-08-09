import { NextResponse } from 'next/server'
import { z } from 'zod'
import { UnitConfigurationError } from '../domain/unit-errors'

export function unitHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.errors[0]?.message || '单位配置无效' }, { status: 400 })
  }
  if (error instanceof UnitConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
