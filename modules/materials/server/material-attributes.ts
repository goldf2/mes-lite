import type { Prisma } from '@prisma/client'
import { materialExtensionScalarFields, type MaterialExtensionInput } from '../contracts/material-extension'

type ExtensionScalarData = Partial<Pick<Prisma.MaterialCreateInput, typeof materialExtensionScalarFields[number]>>
type ExtensionCreateData = ExtensionScalarData & Pick<Prisma.MaterialCreateInput, 'purposes' | 'modelUsages'>
type ExtensionUpdateData = ExtensionScalarData & Pick<Prisma.MaterialUpdateInput, 'purposes' | 'modelUsages'>

/** Optional fields are a patch: undefined preserves data; null or [] explicitly clears it. */
export function materialExtensionData(input: MaterialExtensionInput, mode: 'create'): ExtensionCreateData
export function materialExtensionData(input: MaterialExtensionInput, mode?: 'update'): ExtensionUpdateData
export function materialExtensionData(input: MaterialExtensionInput, mode: 'create' | 'update' = 'update') {
  const data: Record<string, unknown> = {}
  for (const field of materialExtensionScalarFields) {
    const value = input[field]
    if (value !== undefined) data[field] = typeof value === 'string' ? value.trim() || null : value
  }
  if (input.purposeCodes !== undefined) {
    data.purposes = {
      ...(mode === 'update' ? { deleteMany: {} } : {}),
      create: input.purposeCodes.map((purposeCode) => ({ purposeCode })),
    }
  }
  if (input.modelUsages !== undefined) {
    data.modelUsages = {
      ...(mode === 'update' ? { deleteMany: {} } : {}),
      create: input.modelUsages.map((usage) => ({
        modelCode: usage.modelCode.trim(),
        assemblyName: usage.assemblyName?.trim() || '',
        quantityPerMachine: usage.quantityPerMachine ?? null,
      })),
    }
  }
  return data
}

export const materialAttributeInclude = {
  purposes: { select: { purposeCode: true }, orderBy: { purposeCode: 'asc' as const } },
  modelUsages: {
    select: { id: true, modelCode: true, assemblyName: true, quantityPerMachine: true },
    orderBy: [{ modelCode: 'asc' as const }, { assemblyName: 'asc' as const }],
  },
} satisfies Prisma.MaterialInclude

export function withMaterialAttributes<T extends { purposes: Array<{ purposeCode: string }> }>(material: T) {
  return { ...material, purposeCodes: material.purposes.map((purpose) => purpose.purposeCode) }
}
