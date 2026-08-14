import { Prisma } from '@prisma/client'
import type { AuditContext } from '@/lib/audit'
import { createAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import type {
  CopyQualityInspectionStandardInput,
  ObsoleteQualityInspectionStandardInput,
  QualityInspectionStandardInput,
} from '../contracts/quality-inspection-standard-schema'
import { QualityInspectionDomainError } from '../domain/quality-inspection-errors'
import { calculateSuggestedSampleQty } from '../domain/quality-sampling-rules'

export { calculateSuggestedSampleQty }

export interface QualityInspectionStandardActor {
  operatorName: string
  auditContext: AuditContext
}

const standardInclude = {
  material: { select: { id: true, code: true, name: true, stockUnit: true, deletedAt: true } },
  items: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.QualityInspectionStandardInclude

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

function standardData(input: QualityInspectionStandardInput) {
  return {
    name: input.name.trim(),
    samplingMode: input.samplingMode,
    sampleValue: input.samplingMode === 'FULL' ? 0 : input.sampleValue,
    minSampleQty: input.minSampleQty ?? null,
    maxSampleQty: input.maxSampleQty ?? null,
    changeReason: input.changeReason.trim(),
  }
}

function itemData(input: QualityInspectionStandardInput['items']) {
  return input.map((item, index) => ({
    name: item.name.trim(), method: item.method.trim(), acceptanceCriteria: item.acceptanceCriteria.trim(), sortOrder: index + 1,
  }))
}

async function withStandardErrors<T>(operation: () => Promise<T>) {
  try { return await operation() } catch (error) {
    if (error instanceof QualityInspectionDomainError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new QualityInspectionDomainError('标准编码与版本已存在，或同一物料和来源已有生效标准', 409)
    }
    throw error
  }
}

async function assertActiveMaterial(tx: Prisma.TransactionClient, materialId: string) {
  const material = await tx.material.findFirst({ where: { id: materialId, deletedAt: null }, select: { id: true } })
  if (!material) throw new QualityInspectionDomainError('适用物料不存在或已归档', 404)
}

export async function createQualityInspectionStandard(input: QualityInspectionStandardInput, actor: QualityInspectionStandardActor) {
  return withStandardErrors(() => prisma.$transaction(async (tx) => {
    await assertActiveMaterial(tx, input.materialId)
    const code = normalizeCode(input.code)
    if (await tx.qualityInspectionStandard.findFirst({ where: { code }, select: { id: true } })) {
      throw new QualityInspectionDomainError('标准编码已存在；请从现有标准复制新版本', 409)
    }
    const saved = await tx.qualityInspectionStandard.create({
      data: {
        code, version: 1, materialId: input.materialId, sourceType: input.sourceType,
        ...standardData(input), createdBy: actor.operatorName.trim(), items: { create: itemData(input.items) },
      },
      include: standardInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'QUALITY_STANDARD_CREATE', entityType: 'QUALITY_INSPECTION_STANDARD', entityId: saved.id,
      entityLabel: `${saved.code} v${saved.version} ${saved.name}`, afterData: saved, note: saved.changeReason,
    })
    return saved
  }))
}

export async function updateQualityInspectionStandard(id: string, input: QualityInspectionStandardInput, actor: QualityInspectionStandardActor) {
  return withStandardErrors(() => prisma.$transaction(async (tx) => {
    const existing = await tx.qualityInspectionStandard.findUnique({ where: { id }, include: standardInclude })
    if (!existing) throw new QualityInspectionDomainError('检验标准不存在', 404)
    if (existing.status !== 'DRAFT') throw new QualityInspectionDomainError('只有草稿标准可以修改')
    if (normalizeCode(input.code) !== existing.code || input.materialId !== existing.materialId || input.sourceType !== existing.sourceType) {
      throw new QualityInspectionDomainError('标准编码、适用物料和来源类型不能在草稿中改写；请新建标准')
    }
    await assertActiveMaterial(tx, input.materialId)
    await tx.qualityInspectionStandardItem.deleteMany({ where: { standardId: id } })
    const saved = await tx.qualityInspectionStandard.update({
      where: { id }, data: { ...standardData(input), items: { create: itemData(input.items) } }, include: standardInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'QUALITY_STANDARD_UPDATE_DRAFT', entityType: 'QUALITY_INSPECTION_STANDARD', entityId: saved.id,
      entityLabel: `${saved.code} v${saved.version} ${saved.name}`, beforeData: existing, afterData: saved, note: saved.changeReason,
    })
    return saved
  }))
}

export async function copyQualityInspectionStandard(id: string, input: CopyQualityInspectionStandardInput, actor: QualityInspectionStandardActor) {
  return withStandardErrors(() => prisma.$transaction(async (tx) => {
    const existing = await tx.qualityInspectionStandard.findUnique({ where: { id }, include: standardInclude })
    if (!existing) throw new QualityInspectionDomainError('检验标准不存在', 404)
    const aggregate = await tx.qualityInspectionStandard.aggregate({ where: { code: existing.code }, _max: { version: true } })
    const saved = await tx.qualityInspectionStandard.create({
      data: {
        code: existing.code, version: (aggregate._max.version || 0) + 1, name: existing.name,
        materialId: existing.materialId, sourceType: existing.sourceType, samplingMode: existing.samplingMode,
        sampleValue: existing.sampleValue, minSampleQty: existing.minSampleQty, maxSampleQty: existing.maxSampleQty,
        changeReason: input.changeReason.trim(), createdBy: actor.operatorName.trim(),
        items: { create: existing.items.map((item) => ({ name: item.name, method: item.method, acceptanceCriteria: item.acceptanceCriteria, sortOrder: item.sortOrder })) },
      }, include: standardInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'QUALITY_STANDARD_COPY_VERSION', entityType: 'QUALITY_INSPECTION_STANDARD', entityId: saved.id,
      entityLabel: `${saved.code} v${saved.version} ${saved.name}`, beforeData: existing, afterData: saved, note: input.changeReason,
    })
    return saved
  }))
}

export async function releaseQualityInspectionStandard(id: string, actor: QualityInspectionStandardActor, now = new Date()) {
  return withStandardErrors(() => prisma.$transaction(async (tx) => {
    const existing = await tx.qualityInspectionStandard.findUnique({ where: { id }, include: standardInclude })
    if (!existing) throw new QualityInspectionDomainError('检验标准不存在', 404)
    if (existing.status !== 'DRAFT') throw new QualityInspectionDomainError('只有草稿标准可以发布')
    if (existing.items.length === 0) throw new QualityInspectionDomainError('检验标准至少需要一个检验项目')
    await assertActiveMaterial(tx, existing.materialId)
    const active = await tx.qualityInspectionStandard.findFirst({ where: {
      materialId: existing.materialId, sourceType: existing.sourceType, status: 'RELEASED', id: { not: existing.id },
    }, include: standardInclude })
    if (active) {
      await tx.qualityInspectionStandard.update({ where: { id: active.id }, data: {
        status: 'OBSOLETE', obsoleteAt: now, obsoleteBy: actor.operatorName.trim(),
      } })
    }
    const saved = await tx.qualityInspectionStandard.update({
      where: { id }, data: { status: 'RELEASED', releasedAt: now, releasedBy: actor.operatorName.trim() }, include: standardInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'QUALITY_STANDARD_RELEASE', entityType: 'QUALITY_INSPECTION_STANDARD', entityId: saved.id,
      entityLabel: `${saved.code} v${saved.version} ${saved.name}`, beforeData: existing, afterData: saved, note: saved.changeReason,
    })
    if (active) await createAuditLog(tx, actor.auditContext, {
      action: 'QUALITY_STANDARD_AUTO_OBSOLETE', entityType: 'QUALITY_INSPECTION_STANDARD', entityId: active.id,
      entityLabel: `${active.code} v${active.version} ${active.name}`, beforeData: active,
      afterData: { ...active, status: 'OBSOLETE', obsoleteAt: now, obsoleteBy: actor.operatorName.trim() },
      note: `由 ${saved.code} v${saved.version} 替代`,
    })
    return saved
  }))
}

export async function obsoleteQualityInspectionStandard(id: string, input: ObsoleteQualityInspectionStandardInput, actor: QualityInspectionStandardActor, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.qualityInspectionStandard.findUnique({ where: { id }, include: standardInclude })
    if (!existing) throw new QualityInspectionDomainError('检验标准不存在', 404)
    if (existing.status !== 'RELEASED') throw new QualityInspectionDomainError('只有已发布标准可以停用')
    const saved = await tx.qualityInspectionStandard.update({ where: { id }, data: {
      status: 'OBSOLETE', obsoleteAt: now, obsoleteBy: actor.operatorName.trim(),
    }, include: standardInclude })
    await createAuditLog(tx, actor.auditContext, {
      action: 'QUALITY_STANDARD_OBSOLETE', entityType: 'QUALITY_INSPECTION_STANDARD', entityId: saved.id,
      entityLabel: `${saved.code} v${saved.version} ${saved.name}`, beforeData: existing, afterData: saved, note: input.reason,
    })
    return saved
  })
}
