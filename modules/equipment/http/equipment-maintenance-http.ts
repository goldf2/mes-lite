import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DataScopeError } from '@/modules/identity-access'
import { EquipmentDomainError } from '../domain/equipment-errors'

export function equipmentMaintenanceHttpError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
  if (error instanceof EquipmentDomainError || error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof Error && /库存不足|批次余额不足|库位.*不足/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 })
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
