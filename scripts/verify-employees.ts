import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const sourceRoot = process.cwd()
const requiredModuleFiles = [
  'modules/configuration/client/employee-api.ts',
  'modules/configuration/contracts/employee.ts',
  'modules/configuration/model/employee-view.ts',
  'modules/configuration/ui/EmployeePageModule.tsx',
]
for (const path of requiredModuleFiles) assert.ok(existsSync(join(sourceRoot, path)), `业务配置缺少员工模块文件：${path}`)
const pageSource = readFileSync(join(sourceRoot, 'modules/configuration/ui/EmployeePageModule.tsx'), 'utf8')
const registrySource = readFileSync(join(sourceRoot, 'app/components/shell/WorkspacePageRendererRegistry.tsx'), 'utf8')
assert.ok(pageSource.split('\n').length <= 230, '员工协调页应保持在 230 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '员工页不得直接调用 fetch')
assert.match(pageSource, /loadEmployees\(/, '员工页必须通过业务配置 client 读取数据')
assert.match(registrySource, /EmployeePageModule/, '员工页必须通过业务配置模块公开入口加载')

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
    const { employeeNamesSnapshot, nextEmployeeCode, resolveActiveEmployees } = await import('../lib/employees')
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const registeredOperator = await prisma.operator.create({
      data: {
        username: `employee-user-${suffix}`,
        passwordHash: 'verification-only',
        name: '员工甲登录账号',
        role: 'OPERATOR',
        status: 'ACTIVE',
      },
    })
    const firstCode = await prisma.$transaction((tx) => nextEmployeeCode(tx))
    assert.equal(firstCode, 'EMP-000001')
    const employeeA = await prisma.employee.create({ data: { code: firstCode, name: '员工甲', department: '生产部', operatorId: registeredOperator.id } })
    await prisma.employee.create({ data: { code: 'LEGACY-001', name: '旧编码员工' } })
    const secondCode = await prisma.$transaction((tx) => nextEmployeeCode(tx))
    assert.equal(secondCode, 'EMP-000002', '新编码应跳过非系统格式的历史员工编码')
    const employeeB = await prisma.employee.create({ data: { code: secondCode, name: '员工乙', department: '质检部' } })
    const linkedOperator = await prisma.operator.findUniqueOrThrow({
      where: { id: registeredOperator.id },
      include: { employee: true },
    })
    assert.equal(linkedOperator.employee?.id, employeeA.id)
    await assert.rejects(
      prisma.employee.update({ where: { id: employeeB.id }, data: { operatorId: registeredOperator.id } }),
      /Unique constraint failed/,
    )
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
    await prisma.operator.delete({ where: { id: registeredOperator.id } })
    const employeeAfterAccountDelete = await prisma.employee.findUniqueOrThrow({ where: { id: employeeA.id } })
    assert.equal(employeeAfterAccountDelete.operatorId, null, '删除测试账号后员工档案应保留并解除绑定')

    console.log('员工自动编码、注册账号一对一绑定、在职校验、业务人员关联及历史姓名快照验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
