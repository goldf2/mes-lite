import { prisma } from '@/lib/prisma'
import { defaultWorkspaceLayout, normalizeWorkspaceFunctionKeys } from '@/lib/workspace'
import type { z } from 'zod'
import type { workspacePreferenceInputSchema } from '../contracts/workspace-preferences'

function parseStoredKeys(value: string | null | undefined) {
  try { return normalizeWorkspaceFunctionKeys(JSON.parse(value || '[]')) } catch { return [] }
}

export async function getWorkspacePreference(operatorId: string) {
  const [preference, usage] = await Promise.all([
    prisma.operatorWorkspacePreference.findUnique({ where: { operatorId } }),
    prisma.operatorFunctionUsage.findMany({ where: { operatorId }, orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }] }),
  ])
  return {
    mode: preference?.mode === 'SMART' || preference?.mode === 'CUSTOM' ? preference.mode : 'DEFAULT',
    layout: preference ? parseStoredKeys(preference.layoutJson) : defaultWorkspaceLayout,
    pinned: preference ? parseStoredKeys(preference.pinnedJson) : [],
    usage: usage.map((item) => ({ functionKey: item.functionKey, useCount: item.useCount, lastUsedAt: item.lastUsedAt })),
  }
}

export async function saveWorkspacePreference(operatorId: string, input: z.infer<typeof workspacePreferenceInputSchema>) {
  const layout = normalizeWorkspaceFunctionKeys(input.layout)
  const pinned = normalizeWorkspaceFunctionKeys(input.pinned)
  const saved = await prisma.operatorWorkspacePreference.upsert({
    where: { operatorId },
    create: { operatorId, mode: input.mode, layoutJson: JSON.stringify(layout), pinnedJson: JSON.stringify(pinned) },
    update: { mode: input.mode, layoutJson: JSON.stringify(layout), pinnedJson: JSON.stringify(pinned) },
  })
  return { mode: saved.mode, layout, pinned }
}

export async function recordWorkspaceUsage(operatorId: string, functionKey: string) {
  const now = new Date()
  const usage = await prisma.operatorFunctionUsage.upsert({
    where: { operatorId_functionKey: { operatorId, functionKey } },
    create: { operatorId, functionKey, useCount: 1, lastUsedAt: now },
    update: { useCount: { increment: 1 }, lastUsedAt: now },
  })
  return { functionKey: usage.functionKey, useCount: usage.useCount, lastUsedAt: usage.lastUsedAt }
}
