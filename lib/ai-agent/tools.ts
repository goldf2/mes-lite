import type { PermissionMap, PermissionResource } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { expandProductionOrderStatusFilters, normalizeProductionOrderStatus } from '@/modules/production'

type JsonSchema = Record<string, unknown>

export interface AgentToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

export interface AgentToolResult {
  source: string
  data: unknown
}

interface ToolSpec {
  resource: PermissionResource | null
  definition: AgentToolDefinition
}

const toolSpecs: ToolSpec[] = [
  {
    resource: null,
    definition: {
      type: 'function',
      function: {
        name: 'get_system_guidance',
        description: '查询 MES-lite 某个模块的用途、标准业务流程和使用方法。用户询问系统如何使用时调用。',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '模块或问题，例如物料、BOM、生产订单、来料、库存、发货、退货' },
          },
          required: ['topic'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    resource: 'materials',
    definition: {
      type: 'function',
      function: {
        name: 'search_materials',
        description: '按编码、名称或规格搜索物料，返回物料基础参数、单位和库存摘要。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '物料编码、名称或规格关键词；留空表示最近物料' },
            category: { type: 'string', enum: ['RAW', 'FINISHED', 'AUXILIARY', 'SCRAP', 'DEFECTIVE', 'PACKAGING', 'OTHER'] },
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    resource: 'stocks',
    definition: {
      type: 'function',
      function: {
        name: 'query_inventory',
        description: '查询物料库存、可用数量、核算库存、库存金额和库位余额，也可筛选低库存。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '物料编码、名称或规格关键词' },
            lowStockOnly: { type: 'boolean', default: false },
            threshold: { type: 'number', minimum: 0, default: 10, description: '低库存判断阈值' },
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    resource: 'bom',
    definition: {
      type: 'function',
      function: {
        name: 'query_boms',
        description: '按物料查询相关 BOM，返回每个 BOM 的整批投入、整批产出、版本和状态，可用于正查和反查。',
        parameters: {
          type: 'object',
          properties: {
            materialKeyword: { type: 'string', description: '投入或产出物料的编码、名称或规格' },
            limit: { type: 'integer', minimum: 1, maximum: 15, default: 8 },
          },
          required: ['materialKeyword'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    resource: 'orders',
    definition: {
      type: 'function',
      function: {
        name: 'query_production_orders',
        description: '查询生产订单及计划、完成、报废、BOM、状态和更新时间。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '订单号、凭据号、物料编码或名称' },
            statuses: {
              type: 'array',
              items: { type: 'string', enum: ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
            },
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    resource: 'dashboard',
    definition: {
      type: 'function',
      function: {
        name: 'get_business_summary',
        description: '获取今日或本月的生产数量、订单、待处理单据和低库存摘要。',
        parameters: {
          type: 'object',
          properties: {
            range: { type: 'string', enum: ['today', 'month'], default: 'today' },
          },
          additionalProperties: false,
        },
      },
    },
  },
]

const guidanceEntries = [
  { keywords: ['物料'], resource: 'materials', text: '物料管理用于维护统一物料档案、分类、规格、图片、主库存单位和参考/计价单位。原材料、成品、辅材和废料都保存在物料表中。' },
  { keywords: ['bom', 'BOM'], resource: 'bom', text: 'BOM 设置以整批为基准：左侧录入共同投入，右侧录入同时产出。投入和产出可使用各自物料允许的单位；生产实绩按 BOM 比例展开后再登记实际数量。BOM 全览用于按物料正查和反查。' },
  { keywords: ['生产订单', '工单', '生产'], resource: 'orders', text: '生产订单保存计划产品、BOM 和计划数量。一张订单可以包含多个产品。班后在订单详情登记实际投入、产出、人员和库位，确认实绩后库存才发生变化。' },
  { keywords: ['来料', '入库'], resource: 'materialIn', text: '来料单登记供应商、物料、数量、实测参考数量和库位。单据确认后增加对应库位和物料总库存；草稿或待处理单据不会直接改变库存。' },
  { keywords: ['库存', '库位'], resource: 'stocks', text: '库存管理展示主库存数量、可用数量、参考/核算数量、金额及库位余额。库存变化应来自确认后的来料、生产实绩、发货、退货或有原因记录的库存调整。' },
  { keywords: ['发货'], resource: 'shipment', text: '发货单选择物料、数量和发货库位。完成发货后扣减库存；待处理或取消状态不应扣减库存。' },
  { keywords: ['退货'], resource: 'return', text: '退货单记录退货原因和返库库位，审核处理后增加库存，并保留与原发货单的关联和成本快照。' },
  { keywords: ['文档', '图纸', '说明书'], resource: 'workInstructions', text: '产品文档用于保存图纸、PDF、设备操作说明和在线文档，可与物料、生产订单、设备或工作中心关联。' },
] as const

function canRead(permissions: PermissionMap, resource: string) {
  return Boolean(permissions[resource]?.canRead)
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getAvailableAgentTools(permissions: PermissionMap) {
  return toolSpecs
    .filter((tool) => !tool.resource || canRead(permissions, tool.resource))
    .map((tool) => tool.definition)
}

export function getAvailableAgentToolNames(permissions: PermissionMap) {
  return getAvailableAgentTools(permissions).map((tool) => tool.function.name)
}

export async function executeAgentTool(
  name: string,
  rawArguments: unknown,
  permissions: PermissionMap,
): Promise<AgentToolResult> {
  const args = rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)
    ? rawArguments as Record<string, unknown>
    : {}
  const tool = toolSpecs.find((item) => item.definition.function.name === name)
  if (!tool || (tool.resource && !canRead(permissions, tool.resource))) {
    throw new Error('工具不存在或当前账号无权使用')
  }

  if (name === 'get_system_guidance') {
    const topic = stringValue(args.topic)
    const matched = guidanceEntries.filter((entry) => (
      canRead(permissions, entry.resource)
      && entry.keywords.some((keyword) => topic.toLowerCase().includes(keyword.toLowerCase()))
    ))
    return {
      source: 'MES-lite 使用规范',
      data: matched.length > 0
        ? matched.map((entry) => entry.text)
        : guidanceEntries.filter((entry) => canRead(permissions, entry.resource)).map((entry) => entry.text),
    }
  }

  if (name === 'search_materials') {
    const keyword = stringValue(args.keyword)
    const category = stringValue(args.category)
    const limit = finiteNumber(args.limit, 10, 1, 20)
    const materials = await prisma.material.findMany({
      where: {
        deletedAt: null,
        ...(category ? { category } : {}),
        ...(keyword ? { OR: [
          { code: { contains: keyword } },
          { name: { contains: keyword } },
          { spec: { contains: keyword } },
        ] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        code: true,
        name: true,
        spec: true,
        category: true,
        stockUnit: true,
        valuationUnit: true,
        conversionRate: true,
        customer: { select: { name: true } },
        stock: { select: {
          qty: true, reservedQty: true, availableQty: true, quarantineQty: true, holdQty: true, reworkQty: true,
          valuationQty: true, totalCost: true,
        } },
      },
    })
    return { source: '物料档案', data: materials }
  }

  if (name === 'query_inventory') {
    const keyword = stringValue(args.keyword)
    const lowStockOnly = args.lowStockOnly === true
    const threshold = finiteNumber(args.threshold, 10, 0, 1_000_000_000)
    const limit = finiteNumber(args.limit, 10, 1, 20)
    const stocks = await prisma.stock.findMany({
      where: {
        ...(lowStockOnly ? { availableQty: { lte: threshold } } : {}),
        ...(keyword ? { OR: [
          { material: { is: { deletedAt: null, OR: [
            { code: { contains: keyword } },
            { name: { contains: keyword } },
            { spec: { contains: keyword } },
          ] } } },
          { product: { is: { OR: [
            { sku: { contains: keyword } },
            { name: { contains: keyword } },
          ] } } },
        ] } : {}),
      },
      orderBy: lowStockOnly ? { availableQty: 'asc' } : { qty: 'desc' },
      take: limit,
      select: {
        qty: true,
        reservedQty: true,
        availableQty: true,
        quarantineQty: true,
        holdQty: true,
        reworkQty: true,
        valuationQty: true,
        availableValuationQty: true,
        totalCost: true,
        material: { select: { id: true, code: true, name: true, spec: true, stockUnit: true, valuationUnit: true, deletedAt: true } },
        product: { select: { id: true, sku: true, name: true, unit: true } },
        locationBalances: {
          where: { OR: [
            { qty: { not: 0 } }, { reservedQty: { not: 0 } },
            { quarantineQty: { not: 0 } }, { holdQty: { not: 0 } }, { reworkQty: { not: 0 } },
          ] },
          select: {
            qty: true, reservedQty: true, availableQty: true, quarantineQty: true, holdQty: true, reworkQty: true,
            location: { select: { code: true, name: true } },
          },
        },
      },
    })
    return {
      source: '库存余额',
      data: stocks.filter((stock) => !stock.material?.deletedAt || Math.abs(stock.qty) > 0.000001),
    }
  }

  if (name === 'query_boms') {
    const keyword = stringValue(args.materialKeyword)
    const limit = finiteNumber(args.limit, 8, 1, 15)
    if (!keyword) return { source: 'BOM', data: [] }
    const boms = await prisma.bOM.findMany({
      where: {
        status: 'RELEASED',
        OR: [
          { product: { is: { OR: [{ sku: { contains: keyword } }, { name: { contains: keyword } }] } } },
          { outputs: { some: { material: { is: { OR: [
            { code: { contains: keyword } },
            { name: { contains: keyword } },
            { spec: { contains: keyword } },
          ] } } } } },
          { items: { some: { material: { is: { OR: [
            { code: { contains: keyword } },
            { name: { contains: keyword } },
            { spec: { contains: keyword } },
          ] } } } } },
        ],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        version: true,
        isDefault: true,
        product: { select: { sku: true, name: true } },
        items: {
          where: { itemType: 'MATERIAL', materialId: { not: null } },
          select: {
            quantity: true,
            unit: true,
            wastageRate: true,
            material: { select: { id: true, code: true, name: true, spec: true } },
          },
        },
        outputs: {
          select: {
            quantity: true,
            unit: true,
            isPrimary: true,
            material: { select: { id: true, code: true, name: true, spec: true } },
          },
        },
      },
    })
    return { source: 'BOM 关系', data: boms }
  }

  if (name === 'query_production_orders') {
    const keyword = stringValue(args.keyword)
    const requestedStatuses = Array.isArray(args.statuses)
      ? args.statuses.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : []
    const statuses = expandProductionOrderStatusFilters(requestedStatuses)
    const limit = finiteNumber(args.limit, 10, 1, 20)
    const orders = await prisma.productionOrder.findMany({
      where: {
        deletedAt: null,
        ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
        ...(keyword ? { OR: [
          { orderNo: { contains: keyword } },
          { groupNo: { contains: keyword } },
          { voucherNo: { contains: keyword } },
          { targetMaterial: { is: { OR: [
            { code: { contains: keyword } },
            { name: { contains: keyword } },
          ] } } },
        ] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNo: true,
        groupNo: true,
        voucherNo: true,
        planQty: true,
        completeQty: true,
        scrapQty: true,
        status: true,
        bomName: true,
        bomVersion: true,
        updatedAt: true,
        targetMaterial: { select: { id: true, code: true, name: true, stockUnit: true } },
      },
    })
    return {
      source: '生产订单',
      data: orders.map((order) => {
        const status = normalizeProductionOrderStatus(order.status)
        return status === order.status ? order : { ...order, status, legacyStatus: order.status }
      }),
    }
  }

  if (name === 'get_business_summary') {
    const now = new Date()
    const range = args.range === 'month' ? 'month' : 'today'
    const start = range === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = range === 'month'
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const [orders, actuals, output, pendingActuals, pendingMaterialIns, pendingShipments, pendingReturns, lowStocks] = await Promise.all([
      prisma.productionOrder.count({ where: { createdAt: { gte: start, lt: end }, deletedAt: null } }),
      prisma.productionOrderActual.count({ where: { actualDate: { gte: start, lt: end }, status: { in: ['DRAFT', 'CONFIRMED'] } } }),
      prisma.productionOrderActualOutput.aggregate({
        where: { isPrimary: true, actual: { is: { actualDate: { gte: start, lt: end }, status: 'CONFIRMED' } } },
        _sum: { actualQty: true },
      }),
      prisma.productionOrderActual.count({ where: { status: 'DRAFT' } }),
      prisma.materialReceipt.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.shipment.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.returnOrder.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.stock.count({ where: { availableQty: { lt: 10 }, material: { is: { deletedAt: null } } } }),
    ])
    return {
      source: range === 'month' ? '本月经营概览' : '今日经营概览',
      data: {
        range,
        productionOrders: orders,
        productionActuals: actuals,
        confirmedPrimaryOutputQty: output._sum.actualQty || 0,
        pending: {
          productionActuals: pendingActuals,
          materialIns: pendingMaterialIns,
          shipments: pendingShipments,
          returns: pendingReturns,
        },
        lowStockMaterialCount: lowStocks,
      },
    }
  }

  throw new Error('工具未实现')
}
