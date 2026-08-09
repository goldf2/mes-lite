import { materialAsProductOption } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { sawingCostScenarioInclude } from './sawing-cost-select'

export async function listSawingCostWorkspace() {
  const [data, processTemplates, products, materials] = await Promise.all([
    prisma.sawingCostScenario.findMany({ include: sawingCostScenarioInclude, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.processTemplate.findMany({
      select: { id: true, code: true, name: true, category: true },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    }),
    prisma.product.findMany({ select: { id: true, sku: true, name: true, unit: true }, orderBy: { createdAt: 'desc' } }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true, customerId: true,
        customer: { select: { id: true, code: true, name: true } }, stockUnit: true, unit: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return { data, processTemplates, products: [...materials.map(materialAsProductOption), ...products] }
}
