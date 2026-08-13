import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireAnyResourcePermission, requireResourcePermission } from '@/lib/permissions'
import { partyIdSchema, partyInputSchema, partyUpdateSchema } from '../contracts/party-schema'
import type { PartyKind } from '../contracts/reference-data'
import { PartyDomainError } from '../domain/party-errors'
import { getPartyKindDefinition } from '../domain/party-kind'
import { archiveManagedParty, createManagedParty, listManagedParties, updateManagedParty } from '../server/party-service'

function partyHttpError(error: unknown, operation: string, label: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
  }
  if (error instanceof PartyDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`${operation} ${label} error:`, error)
  return NextResponse.json({ error: `${operation}${label}失败` }, { status: 500 })
}

export function createPartyRouteHandlers(kind: PartyKind) {
  const definition = getPartyKindDefinition(kind)
  return {
    async GET(req: NextRequest) {
      try {
        const denied = await requireAnyResourcePermission(definition.referenceReadResources, 'read')
        if (denied) return denied
        return NextResponse.json({ data: await listManagedParties(kind, new URL(req.url).searchParams.get('keyword')) })
      } catch (error) {
        return partyHttpError(error, '获取', definition.label)
      }
    },

    async POST(req: NextRequest) {
      try {
        const denied = await requireResourcePermission(definition.permissionResource, 'create')
        if (denied) return denied
        const created = await createManagedParty(kind, partyInputSchema.parse(await req.json()))
        await writeAuditLog(req, {
          action: 'CREATE', entityType: definition.entityType, entityId: created.id,
          entityLabel: created.code, afterData: created,
        })
        return NextResponse.json({ data: created }, { status: 201 })
      } catch (error) {
        return partyHttpError(error, '创建', definition.label)
      }
    },

    async PUT(req: NextRequest) {
      try {
        const denied = await requireResourcePermission(definition.permissionResource, 'update')
        if (denied) return denied
        const { id, ...input } = partyUpdateSchema.parse(await req.json())
        const { current, updated } = await updateManagedParty(kind, id, input)
        await writeAuditLog(req, {
          action: 'UPDATE', entityType: definition.entityType, entityId: updated.id,
          entityLabel: updated.code, beforeData: current, afterData: updated,
        })
        return NextResponse.json({ data: updated })
      } catch (error) {
        return partyHttpError(error, '更新', definition.label)
      }
    },

    async DELETE(req: NextRequest) {
      try {
        const denied = await requireResourcePermission(definition.permissionResource, 'delete')
        if (denied) return denied
        const id = partyIdSchema.parse(new URL(req.url).searchParams.get('id'))
        const { current, archived } = await archiveManagedParty(kind, id)
        await writeAuditLog(req, {
          action: 'ARCHIVE', entityType: definition.entityType, entityId: archived.id,
          entityLabel: archived.code, beforeData: current, afterData: archived,
        })
        return NextResponse.json({ success: true, message: `${definition.label}已归档，可在归档记录中恢复` })
      } catch (error) {
        return partyHttpError(error, '归档', definition.label)
      }
    },
  }
}
