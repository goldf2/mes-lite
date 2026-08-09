import { prisma } from '@/lib/prisma'
import {
  getCustomUnits,
  getUnitCatalog,
  normalizeCustomUnit,
  normalizeUnitCode,
  presetUnitCatalog,
  saveCustomUnits,
} from '@/lib/unit-catalog'
import type {
  UnitFieldsInput,
  UnitIdentityInput,
  UnitUpdateInput,
} from '../contracts/unit-schema'
import { UnitConfigurationError } from '../domain/unit-errors'
import {
  sameUnitIdentity,
  unitIdentityExists,
  unitSemanticsChanged,
  type UnitIdentity,
} from '../domain/unit-rules'
import { countConfiguredUnitUsage } from './unit-query-service'

export async function createConfiguredUnit(input: UnitFieldsInput) {
  const saved = normalizeCustomUnit(input)
  await prisma.$transaction(async (tx) => {
    const catalog = await getUnitCatalog(tx)
    if (unitIdentityExists(catalog, saved)) {
      throw new UnitConfigurationError(`计量方式下已存在单位 ${saved.code}`, 409)
    }
    const customUnits = await getCustomUnits(tx)
    await saveCustomUnits([...customUnits, saved], tx)
  })
  return saved
}

export async function updateConfiguredUnit(input: UnitUpdateInput) {
  const saved = normalizeCustomUnit(input)
  const original: UnitIdentity = {
    code: normalizeUnitCode(input.originalCode),
    measureType: input.originalMeasureType,
  }
  return prisma.$transaction(async (tx) => {
    const customUnits = await getCustomUnits(tx)
    const index = customUnits.findIndex((unit) => sameUnitIdentity(unit, original))
    if (index < 0) throw new UnitConfigurationError('只能修改自定义单位', 404)
    if (unitIdentityExists([...presetUnitCatalog, ...customUnits], saved, original)) {
      throw new UnitConfigurationError(`计量方式下已存在单位 ${saved.code}`, 409)
    }
    const before = customUnits[index]
    const usageCount = await countConfiguredUnitUsage(original, tx)
    if (usageCount > 0 && unitSemanticsChanged(original, before, saved)) {
      throw new UnitConfigurationError(`该单位已被 ${usageCount} 条物料或 BOM 记录使用，只能修改显示名称`, 409)
    }
    const next = [...customUnits]
    next[index] = saved
    await saveCustomUnits(next, tx)
    return { before, saved, usageCount }
  })
}

export async function deleteConfiguredUnit(input: UnitIdentityInput) {
  const identity: UnitIdentity = {
    code: normalizeUnitCode(input.code),
    measureType: input.measureType,
  }
  return prisma.$transaction(async (tx) => {
    const customUnits = await getCustomUnits(tx)
    const target = customUnits.find((unit) => sameUnitIdentity(unit, identity))
    if (!target) throw new UnitConfigurationError('只能删除自定义单位', 404)
    const usageCount = await countConfiguredUnitUsage(target, tx)
    if (usageCount > 0) {
      throw new UnitConfigurationError(`该单位已被 ${usageCount} 条物料或 BOM 记录使用，不能删除`, 409)
    }
    await saveCustomUnits(customUnits.filter((unit) => !sameUnitIdentity(unit, identity)), tx)
    return target
  })
}
