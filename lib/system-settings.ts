import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export const NATURAL_MATERIAL_CODE_SORT_KEY = 'sorting.materialCodeNatural'

type SettingsClient = PrismaClient | Prisma.TransactionClient

export interface SystemSettings {
  naturalMaterialCodeSortEnabled: boolean
}

export async function getSystemSettings(client: SettingsClient = prisma): Promise<SystemSettings> {
  const naturalCodeSort = await client.systemSetting.findUnique({
    where: { key: NATURAL_MATERIAL_CODE_SORT_KEY },
    select: { value: true },
  })

  return {
    naturalMaterialCodeSortEnabled: naturalCodeSort?.value === 'true',
  }
}

export async function updateSystemSettings(
  settings: SystemSettings,
  client: SettingsClient = prisma,
): Promise<SystemSettings> {
  await client.systemSetting.upsert({
    where: { key: NATURAL_MATERIAL_CODE_SORT_KEY },
    create: {
      key: NATURAL_MATERIAL_CODE_SORT_KEY,
      value: String(settings.naturalMaterialCodeSortEnabled),
    },
    update: {
      value: String(settings.naturalMaterialCodeSortEnabled),
    },
  })

  return getSystemSettings(client)
}
