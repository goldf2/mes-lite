import { PrismaClient } from '@prisma/client'
import path from 'node:path'

const expected = `file:${path.join(process.cwd(), '.runtime/bom-workbench/development.db')}`
if (process.env.DATABASE_URL !== expected) throw new Error('BOM 示例仅允许写入独立工作台数据库')
const prisma = new PrismaClient()
async function main() {
  const input = await prisma.material.upsert({ where: { code: 'BOM-DEMO-RAW' }, update: {}, create: {
    code: 'BOM-DEMO-RAW', name: '示例毛坯', category: 'RAW', unit: '件', stockUnit: '件',
  } })
  const output = await prisma.material.upsert({ where: { code: 'BOM-DEMO-PART' }, update: {}, create: {
    code: 'BOM-DEMO-PART', name: '示例零件', category: 'FINISHED', unit: '件', stockUnit: '件',
  } })
  const product = await prisma.product.upsert({ where: { sku: output.code }, update: {}, create: {
    sku: output.code, name: output.name, materialId: output.id, category: 'FINISHED', unit: '件',
  } })
  if (!await prisma.bOM.findFirst({ where: { productId: product.id } })) {
    await prisma.bOM.create({ data: { productId: product.id, name: '示例零件配方', version: 'v1',
      status: 'DRAFT', isActive: false, isDefault: false, outputQuantity: 1,
      items: { create: { materialId: input.id, quantity: 2, unit: '件' } },
      outputs: { create: { materialId: output.id, quantity: 1, unit: '件', isPrimary: true } },
    } })
  }
}
main().finally(() => prisma.$disconnect())
