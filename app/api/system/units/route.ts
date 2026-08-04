import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import {
  CustomUnitInput,
  getCustomUnits,
  getUnitCatalog,
  measureTypes,
  normalizeCustomUnit,
  normalizeUnitCode,
  presetUnitCatalog,
  saveCustomUnits,
} from '@/lib/unit-catalog'

export const dynamic = 'force-dynamic'

const unitSchema = z.object({
  code: z.string().trim().min(1, '单位编码不能为空').max(20, '单位编码不能超过 20 个字符'),
  name: z.string().trim().min(1, '单位名称不能为空').max(30, '单位名称不能超过 30 个字符'),
  measureType: z.enum(measureTypes),
  toBaseFactor: z.number().finite().positive('换算系数必须大于 0'),
})

const updateSchema = unitSchema.extend({
  originalCode: z.string().trim().min(1),
  originalMeasureType: z.enum(measureTypes),
})

async function unitUsageCount(measureType: string, code: string) {
  const normalizedCode = normalizeUnitCode(code)
  const [materials, bomItems, bomOutputs] = await Promise.all([
    prisma.material.findMany({
      select: {
        primaryMeasure: true,
        referenceMeasure: true,
        stockUnit: true,
        valuationUnit: true,
      },
    }),
    prisma.bOMItem.findMany({
      where: { entryUnit: { not: null }, materialId: { not: null } },
      select: { entryUnit: true, material: { select: { primaryMeasure: true } } },
    }),
    prisma.bOMOutput.findMany({
      where: { entryUnit: { not: null } },
      select: { entryUnit: true, material: { select: { primaryMeasure: true } } },
    }),
  ])
  const materialCount = materials.filter((material) => (
    (material.primaryMeasure === measureType && normalizeUnitCode(material.stockUnit) === normalizedCode)
    || (material.referenceMeasure === measureType && normalizeUnitCode(material.valuationUnit) === normalizedCode)
  )).length
  const bomCount = [...bomItems, ...bomOutputs].filter((row) => (
    row.material?.primaryMeasure === measureType && normalizeUnitCode(row.entryUnit) === normalizedCode
  )).length
  return materialCount + bomCount
}

async function catalogResponse() {
  const [catalog, materials, bomItems, bomOutputs] = await Promise.all([
    getUnitCatalog(),
    prisma.material.findMany({
      select: {
        primaryMeasure: true,
        referenceMeasure: true,
        stockUnit: true,
        valuationUnit: true,
      },
    }),
    prisma.bOMItem.findMany({
      where: { entryUnit: { not: null }, materialId: { not: null } },
      select: { entryUnit: true, material: { select: { primaryMeasure: true } } },
    }),
    prisma.bOMOutput.findMany({
      where: { entryUnit: { not: null } },
      select: { entryUnit: true, material: { select: { primaryMeasure: true } } },
    }),
  ])
  return catalog.map((unit) => {
    const normalizedCode = normalizeUnitCode(unit.code)
    const usedByMaterialCount = materials.filter((material) => (
      (material.primaryMeasure === unit.measureType && normalizeUnitCode(material.stockUnit) === normalizedCode)
      || (material.referenceMeasure === unit.measureType && normalizeUnitCode(material.valuationUnit) === normalizedCode)
    )).length
    const usedByBomCount = [...bomItems, ...bomOutputs].filter((row) => (
      row.material?.primaryMeasure === unit.measureType && normalizeUnitCode(row.entryUnit) === normalizedCode
    )).length
    return {
      ...unit,
      usedByMaterialCount,
      usedByBomCount,
      usageCount: usedByMaterialCount + usedByBomCount,
    }
  })
}

function duplicateUnit(units: Array<{ code: string; measureType: string }>, input: CustomUnitInput, ignored?: { code: string; measureType: string }) {
  const inputCode = normalizeUnitCode(input.code)
  return units.some((unit) => (
    unit.measureType === input.measureType
    && normalizeUnitCode(unit.code) === inputCode
    && !(ignored && unit.measureType === ignored.measureType && normalizeUnitCode(unit.code) === normalizeUnitCode(ignored.code))
  ))
}

export async function GET() {
  try {
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '未登录' }, { status: 401 })
    return NextResponse.json({ data: await catalogResponse() })
  } catch (error) {
    console.error('Get unit catalog error:', error)
    return NextResponse.json({ error: '获取单位配置失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const parsed = unitSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || '单位配置无效' }, { status: 400 })

    const input = normalizeCustomUnit(parsed.data)
    const catalog = await getUnitCatalog()
    if (duplicateUnit(catalog, input)) {
      return NextResponse.json({ error: `计量方式下已存在单位 ${input.code}` }, { status: 409 })
    }
    const before = await getCustomUnits()
    await saveCustomUnits([...before, input])
    await writeAuditLog(req, {
      action: 'CREATE_UNIT',
      entityType: 'SYSTEM_SETTING',
      entityLabel: `${input.measureType}:${input.code}`,
      afterData: input,
      note: `新增单位，1 ${input.code} = ${input.toBaseFactor} 基准单位`,
    })
    return NextResponse.json({ data: await catalogResponse() }, { status: 201 })
  } catch (error) {
    console.error('Create unit error:', error)
    return NextResponse.json({ error: '新增单位失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const parsed = updateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || '单位配置无效' }, { status: 400 })

    const input = normalizeCustomUnit(parsed.data)
    const original = {
      code: normalizeUnitCode(parsed.data.originalCode),
      measureType: parsed.data.originalMeasureType,
    }
    const customUnits = await getCustomUnits()
    const index = customUnits.findIndex((unit) => (
      unit.measureType === original.measureType && normalizeUnitCode(unit.code) === original.code
    ))
    if (index < 0) return NextResponse.json({ error: '只能修改自定义单位' }, { status: 404 })
    if (duplicateUnit([...presetUnitCatalog, ...customUnits], input, original)) {
      return NextResponse.json({ error: `计量方式下已存在单位 ${input.code}` }, { status: 409 })
    }

    const before = customUnits[index]
    const usageCount = await unitUsageCount(original.measureType, original.code)
    const semanticChanged = (
      original.measureType !== input.measureType
      || original.code !== normalizeUnitCode(input.code)
      || Number(before.toBaseFactor) !== Number(input.toBaseFactor)
    )
    if (usageCount > 0 && semanticChanged) {
      return NextResponse.json({ error: `该单位已被 ${usageCount} 条物料或 BOM 记录使用，只能修改显示名称` }, { status: 409 })
    }

    const next = [...customUnits]
    next[index] = input
    await saveCustomUnits(next)
    await writeAuditLog(req, {
      action: 'UPDATE_UNIT',
      entityType: 'SYSTEM_SETTING',
      entityLabel: `${input.measureType}:${input.code}`,
      beforeData: before,
      afterData: input,
      note: usageCount > 0 ? '已使用单位仅修改显示名称' : '修改自定义单位',
    })
    return NextResponse.json({ data: await catalogResponse() })
  } catch (error) {
    console.error('Update unit error:', error)
    return NextResponse.json({ error: '修改单位失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('system', 'update')
    if (denied) return denied
    const { searchParams } = new URL(req.url)
    const code = normalizeUnitCode(searchParams.get('code'))
    const measureType = searchParams.get('measureType')
    if (!code || !measureTypes.includes(measureType as (typeof measureTypes)[number])) {
      return NextResponse.json({ error: '单位参数无效' }, { status: 400 })
    }
    const customUnits = await getCustomUnits()
    const target = customUnits.find((unit) => unit.measureType === measureType && normalizeUnitCode(unit.code) === code)
    if (!target) return NextResponse.json({ error: '只能删除自定义单位' }, { status: 404 })
    const usageCount = await unitUsageCount(target.measureType, code)
    if (usageCount > 0) {
      return NextResponse.json({ error: `该单位已被 ${usageCount} 条物料或 BOM 记录使用，不能删除` }, { status: 409 })
    }
    await saveCustomUnits(customUnits.filter((unit) => unit !== target))
    await writeAuditLog(req, {
      action: 'DELETE_UNIT',
      entityType: 'SYSTEM_SETTING',
      entityLabel: `${measureType}:${code}`,
      beforeData: target,
      note: '删除未使用的自定义单位',
    })
    return NextResponse.json({ data: await catalogResponse() })
  } catch (error) {
    console.error('Delete unit error:', error)
    return NextResponse.json({ error: '删除单位失败' }, { status: 500 })
  }
}
