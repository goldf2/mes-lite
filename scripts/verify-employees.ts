import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-employees-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredModuleFiles = [
    'modules/configuration/client/employee-api.ts',
    'modules/configuration/contracts/employee.ts',
    'modules/configuration/contracts/employee-schema.ts',
    'modules/configuration/domain/employee-errors.ts',
    'modules/configuration/domain/employee-rules.ts',
    'modules/configuration/http/employee-http-errors.ts',
    'modules/configuration/model/employee-view.ts',
    'modules/configuration/server/employee-command-service.ts',
    'modules/configuration/server/employee-query-service.ts',
    'modules/configuration/server/employee-reference-service.ts',
    'modules/configuration/ui/EmployeePageModule.tsx',
  ]
  for (const path of requiredModuleFiles) assert.ok(existsSync(join(root, path)), `业务配置缺少员工模块文件：${path}`)
  assert.equal(existsSync(join(root, 'lib/employees.ts')), false, '员工规则不得继续保留在扁平 lib')

  const pageSource = read('modules/configuration/ui/EmployeePageModule.tsx')
  const registrySource = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  const routeSource = read('app/api/employees/route.ts')
  const moduleIndex = read('modules/configuration/index.ts')
  assert.ok(pageSource.split('\n').length <= 230, '员工协调页应保持在 230 行内')
  assert.doesNotMatch(pageSource, /\bfetch\(/, '员工页不得直接调用 fetch')
  assert.match(pageSource, /loadEmployees\(/, '员工页必须通过业务配置 client 读取数据')
  assert.match(registrySource, /EmployeePageModule/, '员工页必须通过业务配置模块公开入口加载')
  assert.ok(routeSource.split('\n').length <= 75, '员工 API 应保持为不超过 75 行的 HTTP 适配层')
  assert.doesNotMatch(routeSource, /@\/lib\/prisma|\bprisma\.|\$transaction|nextEmployeeCode|ensureOperatorAvailable|tokenizeKeywordQuery/, '员工 API 不得访问 Prisma、持有事务或承载员工规则')
  assert.match(routeSource, /@\/modules\/configuration\//, '员工 API 必须委托业务配置领域')
  assert.match(moduleIndex, /employeeNamesSnapshot|resolveActiveEmployees/, '配置模块必须通过公开出口提供跨领域员工引用能力')

  for (const path of [
    'modules/production/server/production-order-actual-service.ts',
    'modules/production/server/legacy-daily-production-command-service.ts',
  ]) {
    const source = read(path)
    assert.match(source, /from '@\/modules\/configuration'/, `${path} 必须通过配置模块公开出口读取员工引用`)
    assert.doesNotMatch(source, /@\/lib\/employees|@\/modules\/configuration\//, `${path} 不得绕过配置模块公开出口`)
  }

  const services = [
    read('modules/configuration/server/employee-command-service.ts'),
    read('modules/configuration/server/employee-query-service.ts'),
    read('modules/configuration/server/employee-reference-service.ts'),
  ].join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '员工服务不得依赖 HTTP、权限或请求审计')
  assert.doesNotMatch(read('modules/configuration/domain/employee-rules.ts'), /@prisma|@\/lib\/prisma|NextRequest|NextResponse/, '员工领域规则必须保持纯 TypeScript')
}

async function main() {
  const [
    { prisma },
    { EmployeeConfigurationError },
    employeeRules,
    employeeCommands,
    { listEmployeeWorkspace },
    { resolveActiveEmployees },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/configuration/domain/employee-errors'),
    import('../modules/configuration/domain/employee-rules'),
    import('../modules/configuration/server/employee-command-service'),
    import('../modules/configuration/server/employee-query-service'),
    import('../modules/configuration/server/employee-reference-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.equal(employeeRules.nextEmployeeCodeFromExisting(['EMP-000002', 'EMP-X', 'LEGACY-001']), 'EMP-000003')
    assert.deepEqual(employeeRules.employeeWriteData({ name: ' 员工甲 ', department: '', phone: '', note: '', operatorId: '' }), {
      name: '员工甲', department: null, phone: null, note: null, isActive: true, operatorId: null,
    })

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
    const employeeA = await employeeCommands.createManagedEmployee({
      name: '员工甲', department: '生产部', operatorId: registeredOperator.id,
    })
    assert.deepEqual([employeeA.code, employeeA.sortOrder, employeeA.operator?.id], ['EMP-000001', 0, registeredOperator.id])
    await prisma.employee.create({ data: { code: 'LEGACY-001', name: '旧编码员工', sortOrder: 1 } })
    const employeeB = await employeeCommands.createManagedEmployee({ name: '员工乙', department: '质检部' })
    assert.deepEqual([employeeB.code, employeeB.sortOrder], ['EMP-000002', 2], '自动编码必须跳过非系统格式，人工顺序必须接续已有资料')

    await assert.rejects(
      () => employeeCommands.createManagedEmployee({ name: '重复绑定员工', operatorId: registeredOperator.id }),
      (error: unknown) => error instanceof EmployeeConfigurationError && /已绑定员工/.test(error.message),
      '注册账号只能绑定一位员工',
    )
    await assert.rejects(
      () => employeeCommands.createManagedEmployee({ name: '无效账号员工', operatorId: 'missing-operator' }),
      /所选注册账号不存在/,
    )

    const keywordByDepartment = await listEmployeeWorkspace('生产部', true)
    assert.deepEqual(keywordByDepartment.employees.map((employee) => employee.id), [employeeA.id])
    const keywordByAccount = await listEmployeeWorkspace(registeredOperator.username, true)
    assert.deepEqual(keywordByAccount.employees.map((employee) => employee.id), [employeeA.id])
    assert.equal(keywordByAccount.operators.find((operator) => operator.id === registeredOperator.id)?.employee?.id, employeeA.id)

    const ordered = await prisma.$transaction((tx) => resolveActiveEmployees(tx, [employeeB.id, employeeA.id, employeeB.id]))
    assert.deepEqual(ordered.map((employee) => employee.id), [employeeB.id, employeeA.id], '员工引用必须去重并保持输入顺序')
    assert.equal(employeeRules.employeeNamesSnapshot(ordered), '员工乙、员工甲')

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
        workers: employeeRules.employeeNamesSnapshot(ordered),
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

    const updated = await employeeCommands.updateManagedEmployee({
      id: employeeA.id,
      name: '员工甲新姓名',
      department: '生产部',
      phone: null,
      note: null,
      operatorId: registeredOperator.id,
      isActive: false,
    })
    assert.deepEqual([updated.saved.code, updated.saved.name, updated.saved.isActive], ['EMP-000001', '员工甲新姓名', false])
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

    console.log('员工模块验证通过：薄路由、编码、搜索、账号一对一绑定、在职引用、跨领域公开能力和历史姓名快照符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
