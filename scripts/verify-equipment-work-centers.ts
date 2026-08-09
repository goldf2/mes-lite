import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-equipment-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/equipment/client/equipment-api.ts',
    'modules/equipment/contracts/equipment.ts',
    'modules/equipment/contracts/equipment-schema.ts',
    'modules/equipment/contracts/work-center-schema.ts',
    'modules/equipment/domain/equipment-errors.ts',
    'modules/equipment/domain/equipment-rules.ts',
    'modules/equipment/model/equipment-view.ts',
    'modules/equipment/model/work-center-view.ts',
    'modules/equipment/server/equipment-command-service.ts',
    'modules/equipment/server/equipment-query-service.ts',
    'modules/equipment/server/work-center-command-service.ts',
    'modules/equipment/server/work-center-query-service.ts',
    'modules/equipment/ui/EquipmentPageModule.tsx',
    'modules/equipment/ui/WorkCenterSettingsPage.tsx',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `设备领域缺少模块文件：${path}`)
  assert.equal(existsSync(join(root, 'modules/configuration/ui/WorkCenterSettingsPage.tsx')), false, '配置领域不得保留工作中心页面副本')

  const equipmentPage = read('modules/equipment/ui/EquipmentPageModule.tsx')
  const workCenterPage = read('modules/equipment/ui/WorkCenterSettingsPage.tsx')
  const equipmentIndex = read('modules/equipment/index.ts')
  const configurationSection = read('modules/configuration/ConfigurationSectionPage.tsx')
  const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  assert.ok(equipmentPage.split('\n').length <= 230, '设备协调页应保持在 230 行内')
  for (const [path, source] of [
    ['设备页', equipmentPage],
    ['工作中心页', workCenterPage],
  ] as const) {
    assert.match(source, /<ResourcePage\b/, `${path} 必须使用公共 ResourcePage`)
    assert.doesNotMatch(source, /\bfetch\(/, `${path} 不得直接调用 fetch`)
  }
  assert.match(equipmentIndex, /WorkCenterSettingsPage/, '设备领域必须通过公开入口导出工作中心页面')
  assert.match(configurationSection, /from '@\/modules\/equipment'/, '业务配置只能通过设备领域公开入口挂载工作中心')
  assert.doesNotMatch(configurationSection, /\.\/ui\/WorkCenterSettingsPage/, '业务配置不得直接拥有工作中心 UI')
  assert.match(registry, /import\('@\/modules\/equipment'\)/, '设备页必须通过设备模块公开入口加载')

  for (const routePath of ['app/api/equipment/route.ts', 'app/api/work-centers/route.ts']) {
    const route = read(routePath)
    assert.ok(route.split('\n').length <= 100, `${routePath} 应保持为不超过 100 行的 HTTP 适配层`)
    assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|\$transaction\(/, `${routePath} 不得直接访问 Prisma 或持有事务`)
    assert.match(route, /@\/modules\/equipment\//, `${routePath} 必须委托设备领域服务`)
  }

  const services = [
    read('modules/equipment/server/equipment-command-service.ts'),
    read('modules/equipment/server/equipment-query-service.ts'),
    read('modules/equipment/server/work-center-command-service.ts'),
    read('modules/equipment/server/work-center-query-service.ts'),
  ].join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '设备领域服务不得依赖 HTTP、权限或请求审计')
}

async function main() {
  const [
    { prisma },
    { equipmentInputSchema },
    { workCenterFieldsSchema },
    { EquipmentDomainError },
    { createManagedEquipment, updateManagedEquipment, archiveManagedEquipment },
    { listManagedEquipment },
    { createManagedWorkCenter, updateManagedWorkCenter, archiveManagedWorkCenter },
    { listManagedWorkCenters },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/equipment/contracts/equipment-schema'),
    import('../modules/equipment/contracts/work-center-schema'),
    import('../modules/equipment/domain/equipment-errors'),
    import('../modules/equipment/server/equipment-command-service'),
    import('../modules/equipment/server/equipment-query-service'),
    import('../modules/equipment/server/work-center-command-service'),
    import('../modules/equipment/server/work-center-query-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.equal(equipmentInputSchema.safeParse({ code: '  ' }).success, false, '设备字段必须拒绝纯空白')
    assert.equal(workCenterFieldsSchema.safeParse({ code: '  ', name: '空编码' }).success, false, '工作中心字段必须拒绝纯空白')
    await prisma.workCenter.deleteMany()

    const cutting = await createManagedWorkCenter({
      code: ' cut 01 ', name: ' 锯切中心 ', category: ' 下料 ', note: ' 主区域 ',
    })
    assert.deepEqual(
      [cutting.code, cutting.name, cutting.category, cutting.note, cutting.isActive, cutting.sortOrder],
      ['CUT01', '锯切中心', '下料', '主区域', true, 0],
      '工作中心创建必须统一编码、文本和排序规则',
    )
    await assert.rejects(
      () => createManagedWorkCenter({ code: 'cut01', name: '重复中心' }),
      (error: unknown) => error instanceof EquipmentDomainError && error.status === 409,
      '工作中心编码必须唯一',
    )
    const inactive = await createManagedWorkCenter({ code: ' HOLD ', name: '待启用中心', isActive: false })
    const assembly = await createManagedWorkCenter({ code: ' ASSY ', name: '装配中心', category: '装配' })
    assert.deepEqual([inactive.sortOrder, assembly.sortOrder], [1, 2], '新增工作中心必须追加到人工排序末尾')

    await assert.rejects(
      () => createManagedEquipment({
        code: 'eq-bad', name: '不可创建设备', equipmentType: '锯床', workCenterId: inactive.id,
      }),
      /工作中心不存在或已停用/,
      '设备不得归属停用工作中心',
    )
    const equipment = await createManagedEquipment({
      code: ' eq 01 ', name: ' 一号锯床 ', equipmentType: ' 锯床 ', workCenterId: cutting.id,
      model: ' S-100 ', manufacturer: ' 华东设备 ', serialNumber: ' SN-01 ', location: ' A 区 ',
      basicParameters: ' 最大直径 100 ', note: ' 验证设备 ',
    })
    assert.deepEqual(
      [equipment.code, equipment.name, equipment.equipmentType, equipment.workCenter.name, equipment.model, equipment.manufacturer],
      ['EQ01', '一号锯床', '锯床', '锯切中心', 'S-100', '华东设备'],
      '设备服务必须清理输入并装配工作中心视图',
    )
    await assert.rejects(
      () => createManagedEquipment({ code: 'eq01', name: '重复设备', equipmentType: '锯床', workCenterId: cutting.id }),
      (error: unknown) => error instanceof EquipmentDomainError && error.status === 409,
      '设备编码必须唯一',
    )

    const equipmentSearch = await listManagedEquipment({ keyword: '一号 锯切' })
    assert.deepEqual(equipmentSearch.map((item) => item.id), [equipment.id], '设备多关键词必须可跨设备与工作中心字段筛选')
    assert.deepEqual((await listManagedEquipment({ workCenterId: cutting.id })).map((item) => item.id), [equipment.id])
    await assert.rejects(
      () => updateManagedWorkCenter({ id: cutting.id, isActive: false }),
      /请使用归档操作停用工作中心/,
      'PATCH 不得绕开工作中心设备引用归档检查',
    )
    await assert.rejects(
      () => archiveManagedWorkCenter(cutting.id),
      (error: unknown) => error instanceof EquipmentDomainError && error.status === 409,
      '仍有设备引用的工作中心不得归档',
    )

    const moved = await updateManagedEquipment(equipment.id, {
      code: 'eq 01', name: '一号锯床', equipmentType: '自动锯床', workCenterId: assembly.id,
      status: 'IN_USE', model: null, manufacturer: null, serialNumber: null,
      location: 'B 区', basicParameters: null, note: null,
    })
    assert.deepEqual([moved.existing.workCenterId, moved.saved.workCenterId, moved.saved.status], [cutting.id, assembly.id, 'IN_USE'])

    const archivedCenterAt = new Date('2026-08-10T10:00:00.000Z')
    const archivedCenter = await archiveManagedWorkCenter(cutting.id, archivedCenterAt)
    assert.deepEqual([archivedCenter.saved.isActive, archivedCenter.saved.deletedAt?.toISOString()], [false, archivedCenterAt.toISOString()])
    assert.equal((await listManagedWorkCenters(false)).some((item) => item.id === cutting.id), false)
    const restoredCenter = await updateManagedWorkCenter({ id: cutting.id, isActive: true, name: '锯切中心恢复' })
    assert.deepEqual([restoredCenter.saved.isActive, restoredCenter.saved.deletedAt, restoredCenter.saved.name], [true, null, '锯切中心恢复'])

    const material = await prisma.material.create({ data: { code: 'EQ-VERIFY-MAT', name: '设备验证物料', unit: '件' } })
    const category = await prisma.documentCategory.create({ data: { name: '设备验证工艺文件' } })
    await prisma.workInstruction.create({
      data: {
        title: '设备工作中心文档验证', materialId: material.id, categoryId: category.id,
        workCenters: { connect: { id: cutting.id } },
      },
    })
    const listedCenter = (await listManagedWorkCenters(true)).find((item) => item.id === cutting.id)
    assert.equal(listedCenter?._count.workInstructions, 1, '工作中心查询必须集中装配工艺文档引用计数')

    const archivedEquipmentAt = new Date('2026-08-10T10:30:00.000Z')
    const archivedEquipment = await archiveManagedEquipment(equipment.id, archivedEquipmentAt)
    assert.deepEqual(
      [archivedEquipment.saved.status, archivedEquipment.saved.deletedAt?.toISOString()],
      ['STOPPED', archivedEquipmentAt.toISOString()],
      '归档设备必须同步进入停机状态',
    )
    assert.equal((await listManagedEquipment({})).length, 0, '默认设备查询不得返回归档设备')
    assert.equal((await listManagedEquipment({ includeArchived: true })).length, 1)
    await assert.rejects(
      () => updateManagedEquipment(equipment.id, {
        code: 'EQ01', name: '不可更新', equipmentType: '锯床', workCenterId: assembly.id,
      }),
      (error: unknown) => error instanceof EquipmentDomainError && error.status === 404,
      '归档设备不得继续编辑',
    )

    console.log('设备领域验证通过：公共页面骨架、薄 API、工作中心引用、输入规则、搜索、迁移、归档与恢复均符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
