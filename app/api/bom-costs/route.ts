import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const number = z.number().finite().nonnegative()
const schema = z.object({
  productId: z.string().min(1, '请选择产品'),
  quantityBasis: number.positive().default(1),
  laborRatePerHour: number.default(0),
  machineRatePerHour: number.default(0),
  overheadCost: number.default(0),
})

function round(value: number) {
  return Number(value.toFixed(6))
}

function materialUnitCost(item: any) {
  const material = item.material
  if (!material) return 0
  const stockUnitCost = Number(material.stock?.stockUnitCost || 0)
  const valuationUnitCost = Number(material.stock?.valuationUnitCost || 0)
  if (item.unit && material.valuationUnit && item.unit === material.valuationUnit) return valuationUnitCost || stockUnitCost
  return stockUnitCost || valuationUnitCost
}

const runInclude = {
  product: { select: { id: true, sku: true, name: true, unit: true } },
  lines: { orderBy: { sortOrder: 'asc' as const } },
}

type BomCostLineInput = {
  lineType: string
  sourceId: string | null
  code: string | null
  name: string
  quantity: number
  unit: string
  unitCost: number
  materialCost: number
  laborHours: number
  machineHours: number
  laborCost: number
  machineCost: number
  directCost: number
  totalCost: number
  note: string | null
  sortOrder: number
}

export async function GET(req: NextRequest) {
  const denied = await requireResourcePermission('bomCost', 'read')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('productId') || undefined
  const [products, runs] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, sku: true, name: true, unit: true, bom: { select: { id: true, version: true, isActive: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.bomCostRun.findMany({
      where: productId ? { productId } : undefined,
      include: runInclude,
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return NextResponse.json({ products, runs })
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('bomCost', 'create')
    if (denied) return denied

    const operator = await getCurrentOperator()
    const input = schema.parse(await req.json())
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      include: {
        bom: {
          include: {
            items: {
              orderBy: { id: 'asc' },
              include: {
                material: { include: { stock: true } },
                sawingScenario: true,
                costObject: {
                  include: {
                    costs: {
                      where: { active: true },
                      orderBy: { effectiveFrom: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!product) return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    if (!product.bom) return NextResponse.json({ error: '该产品暂无 BOM，无法计算成本' }, { status: 400 })

    const lines: BomCostLineInput[] = []
    product.bom.items.forEach((item, index) => {
      const baseQty = round(Number(item.quantity || 0) * input.quantityBasis * (1 + Number(item.wastageRate || 0) / 100))
      if (item.costObject) {
        const activeCost = item.costObject.costs[0]
        const materialCostPerUnit = Number(activeCost?.materialCostPerUnit || 0)
        const laborHoursPerUnit = Number(activeCost?.laborHoursPerUnit || 0)
        const machineHoursPerUnit = Number(activeCost?.machineHoursPerUnit || 0)
        const directCostPerUnit = Number(activeCost?.directCostPerUnit || 0)
        const materialCost = round(baseQty * materialCostPerUnit)
        const laborHours = round(baseQty * laborHoursPerUnit)
        const machineHours = round(baseQty * machineHoursPerUnit)
        const laborCost = round(laborHours * input.laborRatePerHour)
        const machineCost = round(machineHours * input.machineRatePerHour)
        const directCost = round(baseQty * directCostPerUnit)
        const totalCost = round(materialCost + laborCost + machineCost + directCost)
        lines.push({
          lineType: 'BOM_COST_OBJECT',
          sourceId: item.costObject.id,
          code: item.costObject.code,
          name: item.costObject.name,
          quantity: baseQty,
          unit: item.unit || item.costObject.unit || '件',
          unitCost: baseQty > 0 ? round(totalCost / baseQty) : 0,
          materialCost,
          laborHours,
          machineHours,
          laborCost,
          machineCost,
          directCost,
          totalCost,
          note: item.costObject.objectType === 'SAWING_COST' ? '锯切成本对象' : '成本对象',
          sortOrder: index,
        })
        return
      }

      if (item.itemType === 'SAWING_COST' && item.sawingScenario) {
        const scenario = item.sawingScenario
        const materialCost = round(baseQty * Number(scenario.materialCostPerPiece || 0))
        const laborHours = round(baseQty * Number(scenario.laborHoursPerPiece || 0))
        const machineHours = round(baseQty * Number(scenario.machineHoursPerPiece || 0))
        const laborCost = round(laborHours * input.laborRatePerHour)
        const machineCost = round(machineHours * input.machineRatePerHour)
        const totalCost = round(materialCost + laborCost + machineCost)
        const unitCost = baseQty > 0 ? round(totalCost / baseQty) : 0
        lines.push({
          lineType: 'BOM_COST_OBJECT',
          sourceId: scenario.id,
          code: null,
          name: scenario.name,
          quantity: baseQty,
          unit: item.unit || '件',
          unitCost,
          materialCost,
          laborHours,
          machineHours,
          laborCost,
          machineCost,
          directCost: 0,
          totalCost,
          note: '锯切方案成本对象',
          sortOrder: index,
        })
        return
      }

      if (item.itemType !== 'MATERIAL' || !item.material) return
      const unitCost = materialUnitCost(item)
      const materialCost = round(baseQty * unitCost)
      lines.push({
        lineType: 'BOM_MATERIAL',
        sourceId: item.material.id,
        code: item.material.code,
        name: item.material.name,
        quantity: baseQty,
        unit: item.unit || item.material.stockUnit || item.material.unit,
        unitCost: round(unitCost),
        materialCost,
        laborHours: 0,
        machineHours: 0,
        laborCost: 0,
        machineCost: 0,
        directCost: 0,
        totalCost: materialCost,
        note: item.wastageRate ? `损耗率 ${Number(item.wastageRate).toFixed(2)}%` : null,
        sortOrder: index,
      })
    })

    if (input.overheadCost > 0) {
      lines.push({
        lineType: 'OVERHEAD',
        sourceId: null,
        code: null,
        name: '固定费用分摊',
        quantity: input.quantityBasis,
        unit: product.unit || '批',
        unitCost: round(input.overheadCost / input.quantityBasis),
        materialCost: 0,
        laborHours: 0,
        machineHours: 0,
        laborCost: 0,
        machineCost: 0,
        directCost: 0,
        totalCost: round(input.overheadCost),
        note: '仅本次成本计算分摊，不写入 BOM',
        sortOrder: lines.length,
      })
    }

    const totalMaterialCost = round(lines.reduce((sum, line) => sum + line.materialCost, 0))
    const totalLaborCost = round(lines.reduce((sum, line) => sum + line.laborCost, 0))
    const totalMachineCost = round(lines.reduce((sum, line) => sum + line.machineCost, 0))
    const totalDirectCost = round(lines.reduce((sum, line) => sum + line.directCost, 0))
    const totalCost = round(lines.reduce((sum, line) => sum + line.totalCost, 0))
    const unitCost = input.quantityBasis > 0 ? round(totalCost / input.quantityBasis) : 0

    const run = await prisma.bomCostRun.create({
      data: {
        productId: product.id,
        bomId: product.bom.id,
        bomVersion: product.bom.version,
        quantityBasis: input.quantityBasis,
        laborRatePerHour: input.laborRatePerHour,
        machineRatePerHour: input.machineRatePerHour,
        overheadCost: input.overheadCost,
        totalMaterialCost,
        totalLaborCost,
        totalMachineCost,
        totalDirectCost,
        totalCost,
        unitCost,
        createdBy: operator?.name || operator?.username || null,
        lines: { create: lines },
      },
      include: runInclude,
    })

    await writeAuditLog(req, { action: 'CREATE', entityType: 'BOM_COST_RUN', entityId: run.id, entityLabel: `${product.sku} BOM成本`, afterData: run })
    return NextResponse.json({ data: run }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    console.error('Calculate BOM cost error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'BOM 成本计算失败' }, { status: 500 })
  }
}
