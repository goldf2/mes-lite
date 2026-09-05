import { canonicalizeProductCodes, materialAsProductOption } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { sawingCostScenarioInclude } from './sawing-cost-select'

export async function listSawingCostWorkspace() {
  const [data, processTemplates, materials] = await Promise.all([
    prisma.sawingCostScenario.findMany({ include: sawingCostScenarioInclude, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.processTemplate.findMany({
      select: { id: true, code: true, name: true, category: true },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true, customerId: true,
        customer: { select: { id: true, code: true, name: true } }, stockUnit: true, unit: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const displayProducts = data.flatMap((scenario) => [
    ...(scenario.product ? [scenario.product] : []),
    ...scenario.bomItems.map((item) => item.bom.product),
  ])
  const canonicalProducts = await canonicalizeProductCodes(prisma, displayProducts)
  displayProducts.forEach((product, index) => { product.sku = canonicalProducts[index].sku })
  return { data, processTemplates, products: materials.map(materialAsProductOption) }
}
