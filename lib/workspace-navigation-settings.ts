import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import {
  createDefaultWorkspaceNavigationConfig,
  normalizeWorkspaceNavigationConfig,
  type WorkspaceNavigationConfig,
} from './workspace-navigation-config'

export const WORKSPACE_NAVIGATION_SETTING_KEY = 'interface.workspaceNavigation.v1'

type SettingsClient = PrismaClient | Prisma.TransactionClient

export async function getWorkspaceNavigationConfig(
  client: SettingsClient = prisma,
): Promise<WorkspaceNavigationConfig> {
  const row = await client.systemSetting.findUnique({
    where: { key: WORKSPACE_NAVIGATION_SETTING_KEY },
    select: { value: true },
  })
  if (!row) return createDefaultWorkspaceNavigationConfig()
  try {
    return normalizeWorkspaceNavigationConfig(JSON.parse(row.value))
  } catch {
    return createDefaultWorkspaceNavigationConfig()
  }
}

export async function saveWorkspaceNavigationConfig(
  value: unknown,
  client: SettingsClient = prisma,
): Promise<WorkspaceNavigationConfig> {
  const config = normalizeWorkspaceNavigationConfig(value)
  await client.systemSetting.upsert({
    where: { key: WORKSPACE_NAVIGATION_SETTING_KEY },
    create: { key: WORKSPACE_NAVIGATION_SETTING_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  })
  return config
}
