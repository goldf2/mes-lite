import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-employees-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const { employeeNamesSnapshot, resolveActiveEmployees } = await import('../lib/employees')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const [employeeA, employeeB] = await Promise.all([
      prisma.employee.create({ data: { code: `E-A-${suffix}`, name: '员工甲', department: '生产部' } }),
      prisma.employee.create({ data: { code: `E-B-${suffix}`, name: '员工乙', department: '质检部' } }),
    ])
    const ordered = await prisma.$transaction((tx) => resolveActiveEmployees(tx, [employeeB.id, employeeA.id]))
    assert.deepEqual(ordered.map((employee) => employee.id), [employeeB.id, employeeA.id])
    assert.equal(employeeNamesSnapshot(ordered), '员工乙、员工甲')

    const material = await prisma.material.create({
      data: { code: `EMP-MAT-${suffix}`, name: '员工链路验证物料', category: 'FINISHED', unit: '件' },
    })
    const [source, target] = await Promise.all([
      prisma.inventoryLocation.create({ data: { code: `EMP-S-${suffix}`, name: '员工验证来源' } }),
      prisma.inventoryLocation.create({ data: { code: `EMP-T-${suffix}`, name: '员工验证目标' } }),
    ])
    const report = await prisma.dailyProductionReport.create({
      data: {
        reportNo: `EMP-PR-${suffix}`,
        reportDate: new Date(),
        finishedMaterialId: material.id,
        outputQty: 1,
        workers: employeeNamesSnapshot(ordered),
        bomId: `EMP-BOM-${suffix}`,
        bomName: '员工验证方案',
        bomVersion: 'v1',
        bomType: 'STANDARD',
        bomOutputQuantity: 1,
        bomOutputUnit: '件',
        employees: {
          create: ordered.map((employee) => ({
            employeeId: employee.id,
            employeeCode: employee.code,
            employeeName: employee.name,
          })),
        },
      },
      include: { employees: true },
    })
    const transfer = await prisma.flowTransfer.create({
      data: {
        transferNo: `EMP-FT-${suffix}`,
        transferDate: new Date(),
        materialId: material.id,
        sourceLocationId: source.id,
        targetLocationId: target.id,
        quantity: 1,
        unit: '件',
        employeeId: employeeA.id,
        employeeCode: employeeA.code,
        operator: employeeA.name,
      },
    })

    await prisma.employee.update({ where: { id: employeeA.id }, data: { name: '员工甲新姓名', isActive: false } })
    const [savedReport, savedTransfer] = await Promise.all([
      prisma.dailyProductionReport.findUniqueOrThrow({ where: { id: report.id }, include: { employees: true } }),
      prisma.flowTransfer.findUniqueOrThrow({ where: { id: transfer.id } }),
    ])
    assert.equal(savedReport.workers, '员工乙、员工甲')
    assert.equal(savedReport.employees.find((item) => item.employeeId === employeeA.id)?.employeeName, '员工甲')
    assert.equal(savedTransfer.operator, '员工甲')
    await assert.rejects(
      prisma.$transaction((tx) => resolveActiveEmployees(tx, [employeeA.id])),
      /不存在或已停用/,
    )

    console.log('员工档案、在职校验、生产多人关联、转移单人关联及历史姓名快照验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
