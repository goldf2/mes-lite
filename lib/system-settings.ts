import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export const NATURAL_MATERIAL_CODE_SORT_KEY = 'sorting.materialCodeNatural'
export const COMPANY_NAME_KEY = 'company.name'
export const COMPANY_CONTACT_KEY = 'company.contact'
export const COMPANY_PHONE_KEY = 'company.phone'
export const COMPANY_ADDRESS_KEY = 'company.address'

type SettingsClient = PrismaClient | Prisma.TransactionClient

export interface SystemSettings {
  naturalMaterialCodeSortEnabled: boolean
  companyName: string
  companyContact: string
  companyPhone: string
  companyAddress: string
}

export async function getSystemSettings(client: SettingsClient = prisma): Promise<SystemSettings> {
  const rows = await client.systemSetting.findMany({
    where: { key: { in: [NATURAL_MATERIAL_CODE_SORT_KEY, COMPANY_NAME_KEY, COMPANY_CONTACT_KEY, COMPANY_PHONE_KEY, COMPANY_ADDRESS_KEY] } },
    select: { key: true, value: true },
  })
  const values = new Map(rows.map((row) => [row.key, row.value]))

  return {
    naturalMaterialCodeSortEnabled: values.get(NATURAL_MATERIAL_CODE_SORT_KEY) === 'true',
    companyName: values.get(COMPANY_NAME_KEY) || process.env.COMPANY_NAME || '',
    companyContact: values.get(COMPANY_CONTACT_KEY) || '',
    companyPhone: values.get(COMPANY_PHONE_KEY) || '',
    companyAddress: values.get(COMPANY_ADDRESS_KEY) || '',
  }
}

export async function updateSystemSettings(
  settings: Partial<SystemSettings>,
  client: SettingsClient = prisma,
): Promise<SystemSettings> {
  const entries: Array<readonly [string, string]> = []
  if (settings.naturalMaterialCodeSortEnabled !== undefined) entries.push([NATURAL_MATERIAL_CODE_SORT_KEY, String(settings.naturalMaterialCodeSortEnabled)])
  if (settings.companyName !== undefined) entries.push([COMPANY_NAME_KEY, settings.companyName.trim()])
  if (settings.companyContact !== undefined) entries.push([COMPANY_CONTACT_KEY, settings.companyContact.trim()])
  if (settings.companyPhone !== undefined) entries.push([COMPANY_PHONE_KEY, settings.companyPhone.trim()])
  if (settings.companyAddress !== undefined) entries.push([COMPANY_ADDRESS_KEY, settings.companyAddress.trim()])
  for (const [key, value] of entries) {
    await client.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }

  return getSystemSettings(client)
}
