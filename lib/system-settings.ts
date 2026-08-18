import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import { ContrastMode, DEFAULT_CONTRAST_MODE, normalizeContrastMode } from './contrast-modes'

export const NATURAL_MATERIAL_CODE_SORT_KEY = 'sorting.materialCodeNatural'
export const COMPANY_NAME_KEY = 'company.name'
export const COMPANY_CONTACT_KEY = 'company.contact'
export const COMPANY_PHONE_KEY = 'company.phone'
export const COMPANY_ADDRESS_KEY = 'company.address'
export const BUSINESS_DOCUMENT_PRINT_DENSITY_KEY = 'businessDocument.printDensity'
export const BUSINESS_DOCUMENT_PRINT_MARGIN_MM_KEY = 'businessDocument.printMarginMm'
export const AI_LOADING_INDICATOR_ENABLED_KEY = 'ai.loadingIndicator.enabled'
export const CONTRAST_MODE_KEY = 'interface.contrastMode'

export const BUSINESS_DOCUMENT_PRINT_DENSITIES = ['compact', 'standard'] as const
export type BusinessDocumentPrintDensity = typeof BUSINESS_DOCUMENT_PRINT_DENSITIES[number]
export const DEFAULT_BUSINESS_DOCUMENT_PRINT_DENSITY: BusinessDocumentPrintDensity = 'compact'
export const DEFAULT_BUSINESS_DOCUMENT_PRINT_MARGIN_MM = 10

function normalizeBusinessDocumentPrintDensity(value: unknown): BusinessDocumentPrintDensity {
  return BUSINESS_DOCUMENT_PRINT_DENSITIES.includes(value as BusinessDocumentPrintDensity)
    ? value as BusinessDocumentPrintDensity
    : DEFAULT_BUSINESS_DOCUMENT_PRINT_DENSITY
}

function normalizeBusinessDocumentPrintMarginMm(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(20, Math.max(8, Math.round(parsed))) : DEFAULT_BUSINESS_DOCUMENT_PRINT_MARGIN_MM
}

type SettingsClient = PrismaClient | Prisma.TransactionClient

export interface SystemSettings {
  naturalMaterialCodeSortEnabled: boolean
  companyName: string
  companyContact: string
  companyPhone: string
  companyAddress: string
  businessDocumentPrintDensity: BusinessDocumentPrintDensity
  businessDocumentPrintMarginMm: number
  aiLoadingIndicatorEnabled: boolean
  contrastMode: ContrastMode
}

export async function getSystemSettings(client: SettingsClient = prisma): Promise<SystemSettings> {
  const rows = await client.systemSetting.findMany({
    where: { key: { in: [NATURAL_MATERIAL_CODE_SORT_KEY, COMPANY_NAME_KEY, COMPANY_CONTACT_KEY, COMPANY_PHONE_KEY, COMPANY_ADDRESS_KEY, BUSINESS_DOCUMENT_PRINT_DENSITY_KEY, BUSINESS_DOCUMENT_PRINT_MARGIN_MM_KEY, AI_LOADING_INDICATOR_ENABLED_KEY, CONTRAST_MODE_KEY] } },
    select: { key: true, value: true },
  })
  const values = new Map(rows.map((row) => [row.key, row.value]))

  return {
    naturalMaterialCodeSortEnabled: values.get(NATURAL_MATERIAL_CODE_SORT_KEY) === 'true',
    companyName: values.get(COMPANY_NAME_KEY) || process.env.COMPANY_NAME || '',
    companyContact: values.get(COMPANY_CONTACT_KEY) || '',
    companyPhone: values.get(COMPANY_PHONE_KEY) || '',
    companyAddress: values.get(COMPANY_ADDRESS_KEY) || '',
    businessDocumentPrintDensity: normalizeBusinessDocumentPrintDensity(values.get(BUSINESS_DOCUMENT_PRINT_DENSITY_KEY)),
    businessDocumentPrintMarginMm: normalizeBusinessDocumentPrintMarginMm(values.get(BUSINESS_DOCUMENT_PRINT_MARGIN_MM_KEY)),
    aiLoadingIndicatorEnabled: values.get(AI_LOADING_INDICATOR_ENABLED_KEY) !== 'false',
    contrastMode: normalizeContrastMode(values.get(CONTRAST_MODE_KEY) || DEFAULT_CONTRAST_MODE),
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
  if (settings.businessDocumentPrintDensity !== undefined) entries.push([BUSINESS_DOCUMENT_PRINT_DENSITY_KEY, normalizeBusinessDocumentPrintDensity(settings.businessDocumentPrintDensity)])
  if (settings.businessDocumentPrintMarginMm !== undefined) entries.push([BUSINESS_DOCUMENT_PRINT_MARGIN_MM_KEY, String(normalizeBusinessDocumentPrintMarginMm(settings.businessDocumentPrintMarginMm))])
  if (settings.aiLoadingIndicatorEnabled !== undefined) entries.push([AI_LOADING_INDICATOR_ENABLED_KEY, String(settings.aiLoadingIndicatorEnabled)])
  if (settings.contrastMode !== undefined) entries.push([CONTRAST_MODE_KEY, normalizeContrastMode(settings.contrastMode)])
  for (const [key, value] of entries) {
    await client.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }

  return getSystemSettings(client)
}
