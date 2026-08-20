import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DocumentFieldError } from '../domain/document-field-errors'

export function documentFieldHttpError(error: unknown, fallback: string) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || '字段参数无效' }, { status: 400 })
  if (error instanceof DocumentFieldError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
