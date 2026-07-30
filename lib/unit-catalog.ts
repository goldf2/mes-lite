import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export const UNIT_CATALOG_SETTING_KEY = 'units.customCatalog'

export const measureTypes = ['LENGTH', 'WEIGHT', 'QUANTITY', 'OTHER'] as const
export type MeasureType = (typeof measureTypes)[number]

export interface UnitCatalogEntry {
  code: string
  name: string
  measureType: MeasureType
  toBaseFactor: number
  isBase: boolean
  isPreset: boolean
}

export interface CustomUnitInput {
  code: string
  name: string
  measureType: MeasureType
  toBaseFactor: number
}

type SettingsClient = PrismaClient | Prisma.TransactionClient

export const measureTypeLabels: Record<MeasureType, string> = {
  LENGTH: '长度',
  WEIGHT: '重量',
  QUANTITY: '数量',
  OTHER: '其他',
}

export const baseUnitByMeasure: Record<MeasureType, string> = {
  LENGTH: 'm',
  WEIGHT: 'kg',
  QUANTITY: '件',
  OTHER: '项',
}

export const presetUnitCatalog: UnitCatalogEntry[] = [
  { code: 'm', name: '米', measureType: 'LENGTH', toBaseFactor: 1, isBase: true, isPreset: true },
  { code: 'cm', name: '厘米', measureType: 'LENGTH', toBaseFactor: 0.01, isBase: false, isPreset: true },
  { code: 'mm', name: '毫米', measureType: 'LENGTH', toBaseFactor: 0.001, isBase: false, isPreset: true },
  { code: 'kg', name: '千克', measureType: 'WEIGHT', toBaseFactor: 1, isBase: true, isPreset: true },
  { code: 'g', name: '克', measureType: 'WEIGHT', toBaseFactor: 0.001, isBase: false, isPreset: true },
  { code: 't', name: '吨', measureType: 'WEIGHT', toBaseFactor: 1000, isBase: false, isPreset: true },
  { code: '件', name: '件', measureType: 'QUANTITY', toBaseFactor: 1, isBase: true, isPreset: true },
  { code: '个', name: '个', measureType: 'QUANTITY', toBaseFactor: 1, isBase: false, isPreset: true },
  { code: '根', name: '根', measureType: 'QUANTITY', toBaseFactor: 1, isBase: false, isPreset: true },
  { code: '套', name: '套', measureType: 'QUANTITY', toBaseFactor: 1, isBase: false, isPreset: true },
  { code: '项', name: '项', measureType: 'OTHER', toBaseFactor: 1, isBase: true, isPreset: true },
]

export function normalizeUnitCode(value: unknown) {
  const code = String(value || '').trim()
  return /^[a-z]+$/i.test(code) ? code.toLowerCase() : code
}

export function normalizeCustomUnit(input: CustomUnitInput): CustomUnitInput {
  return {
    code: normalizeUnitCode(input.code),
    name: String(input.name || '').trim(),
    measureType: input.measureType,
    toBaseFactor: Number(input.toBaseFactor),
  }
}

function parseCustomUnits(value?: string | null): CustomUnitInput[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => (
        item
        && measureTypes.includes(item.measureType)
        && normalizeUnitCode(item.code)
        && String(item.name || '').trim()
        && Number.isFinite(Number(item.toBaseFactor))
        && Number(item.toBaseFactor) > 0
      ))
      .map(normalizeCustomUnit)
  } catch {
    return []
  }
}

export async function getCustomUnits(client: SettingsClient = prisma) {
  const setting = await client.systemSetting.findUnique({
    where: { key: UNIT_CATALOG_SETTING_KEY },
    select: { value: true },
  })
  return parseCustomUnits(setting?.value)
}

export async function getUnitCatalog(client: SettingsClient = prisma): Promise<UnitCatalogEntry[]> {
  const customUnits = await getCustomUnits(client)
  return [
    ...presetUnitCatalog,
    ...customUnits.map((unit) => ({ ...unit, isBase: false, isPreset: false })),
  ]
}

export async function saveCustomUnits(units: CustomUnitInput[], client: SettingsClient = prisma) {
  const normalized = units.map(normalizeCustomUnit)
  await client.systemSetting.upsert({
    where: { key: UNIT_CATALOG_SETTING_KEY },
    create: { key: UNIT_CATALOG_SETTING_KEY, value: JSON.stringify(normalized) },
    update: { value: JSON.stringify(normalized) },
  })
  return getUnitCatalog(client)
}

export function findCatalogUnit(catalog: UnitCatalogEntry[], measureType: string | null | undefined, code: unknown) {
  const normalizedCode = normalizeUnitCode(code)
  return catalog.find((unit) => unit.measureType === measureType && normalizeUnitCode(unit.code) === normalizedCode) || null
}

export function convertUnitValue(value: number, fromUnit: UnitCatalogEntry, toUnit: UnitCatalogEntry) {
  if (fromUnit.measureType !== toUnit.measureType) {
    throw new Error('不同计量方式之间不能直接换算')
  }
  return Number((Number(value) * fromUnit.toBaseFactor / toUnit.toBaseFactor).toFixed(6))
}
