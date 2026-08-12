import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. 唯一物品主档：成品和原材料都先创建为 Material。
  const bearing = await prisma.material.create({
    data: {
      code: 'ZC-6204',
      name: '深沟球轴承 6204',
      spec: '内径20mm',
      category: 'FINISHED',
      unit: '件',
      stockUnit: '件',
    },
  })

  const gear = await prisma.material.create({
    data: {
      code: 'CL-8M',
      name: '直齿轮 8模 80齿',
      category: 'FINISHED',
      unit: '件',
      stockUnit: '件',
    },
  })

  const steel = await prisma.material.create({
    data: {
      code: 'GC-15',
      name: 'GCr15 轴承钢',
      spec: 'Φ30mm 圆钢',
      unit: 'kg',
      stock: {
        create: {
          qty: 500,
          availableQty: 500,
        },
      },
    },
  })

  const iron = await prisma.material.create({
    data: {
      code: 'QT-500',
      name: 'QT500-7 球墨铸铁',
      spec: '铸件毛坯',
      unit: 'kg',
      stock: {
        create: {
          qty: 800,
          availableQty: 800,
        },
      },
    },
  })

  const cutter = await prisma.material.create({
    data: {
      code: 'CT-001',
      name: '硬质合金车刀',
      spec: 'CNMG120408',
      unit: '片',
      stock: {
        create: {
          qty: 100,
          availableQty: 100,
        },
      },
    },
  })

  // 2. Product 只是旧外键的兼容投影，必须显式绑定同一 Material。
  const product1 = await prisma.product.create({
    data: {
      sku: 'ZC-6204',
      materialId: bearing.id,
      name: bearing.name,
      category: bearing.category,
      unit: bearing.stockUnit,
      description: bearing.spec,
    },
  })

  const product2 = await prisma.product.create({
    data: {
      sku: 'CL-8M',
      materialId: gear.id,
      name: gear.name,
      category: gear.category,
      unit: gear.stockUnit,
    },
  })

  // 3. 轴承 BOM
  const bom1 = await prisma.bOM.create({
    data: {
      productId: product1.id,
      materialId: bearing.id,
      version: 'v1',
      outputs: { create: { materialId: bearing.id, quantity: 1, unit: '件', isPrimary: true } },
      items: {
        create: [
          { materialId: steel.id, quantity: 0.35, unit: 'kg', wastageRate: 0.05 },
          { materialId: cutter.id, quantity: 0.02, unit: '片', wastageRate: 0 },
        ],
      },
    },
  })
  await prisma.bOM.update({
    where: { id: bom1.id },
    data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
  })

  // 4. 齿轮 BOM
  const bom2 = await prisma.bOM.create({
    data: {
      productId: product2.id,
      materialId: gear.id,
      version: 'v1',
      outputs: { create: { materialId: gear.id, quantity: 1, unit: '件', isPrimary: true } },
      items: {
        create: [
          { materialId: iron.id, quantity: 2.5, unit: 'kg', wastageRate: 0.08 },
          { materialId: cutter.id, quantity: 0.05, unit: '片', wastageRate: 0 },
        ],
      },
    },
  })
  await prisma.bOM.update({
    where: { id: bom2.id },
    data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() },
  })

  // 5. 轴承工艺路线
  const route1 = await prisma.processRoute.create({
    data: {
      productId: product1.id,
      materialId: bearing.id,
      name: '标准轴承加工路线',
      isDefault: true,
      steps: {
        create: [
          { stepNo: 1, name: '车削', defaultTime: 15, workstation: 'C-01', description: '外圆、内孔、端面粗车' },
          { stepNo: 2, name: '热处理', defaultTime: 180, workstation: 'HT-01', description: '淬火+低温回火' },
          { stepNo: 3, name: '磨削', defaultTime: 25, workstation: 'G-01', description: '内孔、外圆精磨' },
          { stepNo: 4, name: '装配', defaultTime: 10, workstation: 'A-01', description: '钢球、保持架装配' },
        ],
      },
    },
  })

  // 6. 齿轮工艺路线
  const route2 = await prisma.processRoute.create({
    data: {
      productId: product2.id,
      materialId: gear.id,
      name: '齿轮加工路线',
      isDefault: true,
      steps: {
        create: [
          { stepNo: 1, name: '粗车', defaultTime: 20, workstation: 'C-02' },
          { stepNo: 2, name: '滚齿', defaultTime: 30, workstation: 'Y-01' },
          { stepNo: 3, name: '剃齿', defaultTime: 15, workstation: 'T-01' },
          { stepNo: 4, name: '热处理', defaultTime: 200, workstation: 'HT-02' },
        ],
      },
    },
  })

  console.log('Seed completed:')
  console.log(`- Compatibility products: ${product1.name}, ${product2.name}`)
  console.log(`- Materials: ${bearing.name}, ${gear.name}, ${steel.name}, ${iron.name}, ${cutter.name}`)
  console.log(`- BOMs: 2`)
  console.log(`- Routes: 2 with steps`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
