import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DocumentCategoryError } from '../domain/document-category-errors'

export function documentCategoryHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof DocumentCategoryError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
