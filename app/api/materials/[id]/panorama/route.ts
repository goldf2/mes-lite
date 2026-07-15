import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

function withFileUrl<T extends { id: string }>(attachment: T) {
  return { ...attachment, url: `/api/attachments/${attachment.id}/file` }
}

function isWorkInstruction(attachment: { documentType: string; originalName: string; note: string | null }) {
  const text = `${attachment.documentType} ${attachment.originalName} ${attachment.note || ''}`.toLowerCase()
  return (
    attachment.documentType === 'WORK_INSTRUCTION' ||
    text.includes('作业指导') ||
    text.includes('sop') ||
    text.includes('wi')
  )
}

const processRouteSelect = {
  id: true,
  name: true,
  isDefault: true,
  steps: {
    where: { deletedAt: null },
    orderBy: { stepNo: 'asc' as const },
    select: {
      id: true,
      stepNo: true,
      name: true,
      workstation: true,
      description: true,
    },
  },
}

const productSelect = {
  id: true,
  sku: true,
  name: true,
  category: true,
  unit: true,
  customer: { select: { id: true, code: true, name: true } },
  processRoutes: {
    where: { isDefault: true },
    select: processRouteSelect,
  },
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    const material = await prisma.material.findUnique({
      where: { id: params.id },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        stock: true,
        bomItems: {
          orderBy: { id: 'asc' },
          include: {
            bom: {
              include: {
                product: { select: productSelect },
              },
            },
          },
        },
      },
    })

    if (!material || material.deletedAt) {
      return NextResponse.json({ error: '物料不存在或已归档' }, { status: 404 })
    }

    const linkedProductSkus = Array.from(new Set([material.code, `MAT-${material.code}`]))
    const stockId = material.stock?.id

    const [
      attachments,
      targetOrders,
      consumingPicks,
      recentMaterialIns,
      recentStockLogs,
      costLayers,
      linkedProducts,
      formalWorkInstructions,
    ] = await Promise.all([
      prisma.documentAttachment.findMany({
        where: {
          ownerType: 'MATERIAL',
          ownerId: material.id,
          deletedAt: null,
        },
        orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.productionOrder.findMany({
        where: {
          materialId: material.id,
          deletedAt: null,
        },
        include: {
          product: { select: productSelect },
          targetMaterial: {
            select: {
              id: true,
              code: true,
              name: true,
              category: true,
              stockUnit: true,
              valuationUnit: true,
            },
          },
          _count: { select: { picks: true, reports: true, dispatches: true, stockIns: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      prisma.pickItem.findMany({
        where: {
          materialId: material.id,
          order: { deletedAt: null },
        },
        include: {
          order: {
            include: {
              product: { select: productSelect },
              targetMaterial: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  category: true,
                  stockUnit: true,
                  valuationUnit: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      prisma.materialIn.findMany({
        where: {
          materialId: material.id,
          deletedAt: null,
        },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      stockId
        ? prisma.stockLog.findMany({
            where: { stockId },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : Promise.resolve([]),
      prisma.inventoryCostLayer.findMany({
        where: { materialId: material.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.product.findMany({
        where: { sku: { in: linkedProductSkus } },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          processRoutes: {
            where: { isDefault: true },
            select: processRouteSelect,
          },
          bom: {
            include: {
              items: {
                include: {
                  material: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      spec: true,
                      category: true,
                      stockUnit: true,
                      valuationUnit: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.workInstruction.findMany({
        where: {
          deletedAt: null,
          materialId: material.id,
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          material: { select: { id: true, code: true, name: true, spec: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 10,
      }),
    ])

    const images = attachments
      .filter((attachment) => attachment.mimeType.startsWith('image/'))
      .map(withFileUrl)
    const workInstructions = attachments
      .filter((attachment) => isWorkInstruction(attachment))
      .map(withFileUrl)
    const documents = attachments
      .filter((attachment) => !attachment.mimeType.startsWith('image/') || attachment.documentType !== 'MATERIAL_IMAGE')
      .map(withFileUrl)
    const formalWorkInstructionIds = formalWorkInstructions.map((instruction) => instruction.id)
    const formalWorkInstructionAttachments = formalWorkInstructionIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
      where: {
        ownerType: 'WORK_INSTRUCTION',
        ownerId: { in: formalWorkInstructionIds },
        deletedAt: null,
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        ownerId: true,
        originalName: true,
        mimeType: true,
        size: true,
        note: true,
        documentType: true,
        isCover: true,
        createdAt: true,
      },
    })
    const formalAttachmentsByOwner = new Map<string, typeof formalWorkInstructionAttachments>()
    for (const attachment of formalWorkInstructionAttachments) {
      const list = formalAttachmentsByOwner.get(attachment.ownerId) || []
      list.push(attachment)
      formalAttachmentsByOwner.set(attachment.ownerId, list)
    }
    const formalWorkInstructionsWithAttachments = formalWorkInstructions.map((instruction) => {
      const itemAttachments = formalAttachmentsByOwner.get(instruction.id) || []
      return {
        ...instruction,
        attachments: itemAttachments.map(withFileUrl),
        attachmentCount: itemAttachments.length,
        imageCount: itemAttachments.filter((attachment) => attachment.mimeType.startsWith('image/')).length,
        pdfCount: itemAttachments.filter((attachment) => attachment.mimeType === 'application/pdf').length,
      }
    })

    const locationBalances = material.stock
      ? [{
          id: 'default',
          locationCode: 'DEFAULT',
          locationName: '默认库位',
          qty: material.stock.qty,
          reservedQty: material.stock.reservedQty,
          availableQty: material.stock.availableQty,
          valuationQty: material.stock.valuationQty,
          reservedValuationQty: material.stock.reservedValuationQty,
          availableValuationQty: material.stock.availableValuationQty,
          note: '当前版本尚未启用库位明细模型，先以默认库位展示总库存。',
        }]
      : []

    const productBoms = linkedProducts
      .filter((product) => product.bom)
      .map((product) => ({
        id: product.bom!.id,
        version: product.bom!.version,
        isActive: product.bom!.isActive,
        createdAt: product.bom!.createdAt,
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          unit: product.unit,
          customer: product.customer,
          processRoutes: product.processRoutes,
        },
        items: product.bom!.items,
      }))

    const integrityWarnings = [
      ...(!material.stock ? ['物料档案没有对应库存余额记录，库存管理不会显示该物料。'] : []),
    ]

    return NextResponse.json({
      data: {
        material,
        stock: material.stock,
        locationBalances,
        attachments: {
          images,
          documents,
          workInstructions,
        },
        componentBoms: material.bomItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit,
          wastageRate: item.wastageRate,
          bom: item.bom,
        })),
        productBoms,
        workInstructions: formalWorkInstructionsWithAttachments,
        targetOrders,
        consumingPicks,
        recentMaterialIns,
        recentStockLogs,
        costLayers,
        integrityWarnings,
        modelNotes: [
          '库位明细尚未建模，本页先用默认库位展示库存余额。',
          '作业指导书优先读取正式指导书模块，旧附件文档保留为历史资料。',
        ],
      },
    })
  } catch (error) {
    console.error('Get material panorama error:', error)
    return NextResponse.json({ error: '获取物料全景失败' }, { status: 500 })
  }
}
