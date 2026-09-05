import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-bom-process-cost-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, { createBomCostRun }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/bom/server/bom-cost-command-service'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const raw = await prisma.material.create({
      data: { code: `VERIFY-RAW-${suffix}`, name: '验证原料', category: 'RAW', unit: 'kg', stockUnit: 'kg', valuationUnit: 'kg' },
    })
    await prisma.stock.create({ data: { materialId: raw.id, qty: 100, availableQty: 100, stockUnitCost: 5, valuationUnitCost: 5 } })
    const output = await prisma.material.create({
      data: { code: `VERIFY-OUT-${suffix}`, name: '验证成品', category: 'FINISHED', unit: '件', stockUnit: '件', valuationUnit: '件' },
    })
    await prisma.stock.create({ data: { materialId: output.id } })
    const product = await prisma.product.create({
      data: { sku: `VERIFY-PROD-${suffix}`, name: '验证成品', category: 'FINISHED', unit: '件', materialId: output.id },
    })
    const workCenter = await prisma.workCenter.create({ data: { code: `VERIFY-WC-${suffix}`, name: '验证锯切中心', category: 'SAWING' } })
    const route = await prisma.processRoute.create({
      data: {
        productId: product.id, materialId: output.id, name: '验证加工路线', isDefault: true,
        steps: { create: [{
          stepNo: 10, name: '锯切', workCenterId: workCenter.id, templateCode: 'VERIFY-SAW',
          standardBatchQty: 100, setupTimeMinutes: 6, cycleTimeSeconds: 10, peopleCount: 1,
          laborRatePerHour: 20, machineCount: 1, machineRatePerHour: 30,
          energyCostPerHour: 5, consumableCostPerBatch: 10, yieldRate: 1,
        }] },
      },
    })
    const bom = await prisma.bOM.create({
      data: {
        productId: product.id, materialId: output.id, name: '验证 BOM', version: 'v1',
        status: 'DRAFT', isActive: false, isDefault: false,
        outputQuantity: 1, outputUnit: '件',
      },
    })
    await prisma.bOMOutput.create({ data: { bomId: bom.id, materialId: output.id, quantity: 1, unit: '件', isPrimary: true } })
    await prisma.bOMItem.create({ data: { bomId: bom.id, itemType: 'MATERIAL', materialId: raw.id, quantity: 2, unit: 'kg' } })
    await prisma.bOM.update({ where: { id: bom.id }, data: { status: 'RELEASED', isActive: true, isDefault: true, releasedAt: new Date() } })

    const run = await createBomCostRun({
      productId: product.id, processRouteId: route.id, quantityBasis: 100,
      laborRatePerHour: 0, machineRatePerHour: 0, overheadCost: 0,
    }, '验证员')
    const operation = run.lines.find((line) => line.lineType === 'PROCESS_OPERATION')
    assert.equal(run.bomId, bom.id)
    assert.equal(run.processRouteId, route.id)
    assert.equal(run.processRouteName, '验证加工路线')
    assert.ok(operation, '成本快照必须保存工序明细')
    assert.match(operation?.note || '', /验证锯切中心/)
    assert.ok(Number(operation?.laborCost) > 0)
    assert.ok(Number(operation?.machineCost) > 0)
    assert.equal(run.lines.filter((line) => line.lineType === 'BOM_MATERIAL').length, 1)
    console.log('BOM-工艺路线-工作中心成本联动验证通过。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
