import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EmployeeConfigurationError } from '../domain/employee-errors'

export function employeeHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
  }
  if (error instanceof EmployeeConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
