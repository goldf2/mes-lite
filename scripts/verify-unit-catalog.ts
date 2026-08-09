import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-unit-catalog-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredFiles = [
    'modules/configuration/contracts/unit-schema.ts',
    'modules/configuration/domain/unit-errors.ts',
    'modules/configuration/domain/unit-rules.ts',
    'modules/configuration/http/unit-http-errors.ts',
    'modules/configuration/server/unit-command-service.ts',
    'modules/configuration/server/unit-query-service.ts',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `配置领域缺少单位模块文件：${path}`)

  const route = read('app/api/system/units/route.ts')
  assert.ok(route.split('\n').length <= 100, '单位 API 应保持为不超过 100 行的 HTTP 适配层')
  assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|getCustomUnits|getUnitCatalog|saveCustomUnits|unitUsageCount|duplicateUnit/, '单位 API 不得直接访问 Prisma、设置存储或承载单位规则')
  assert.match(route, /@\/modules\/configuration\//, '单位 API 必须委托配置领域')

  const services = [
    read('modules/configuration/server/unit-command-service.ts'),
    read('modules/configuration/server/unit-query-service.ts'),
  ].join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '单位服务不得依赖 HTTP、权限或请求审计')
  assert.doesNotMatch(read('modules/configuration/domain/unit-rules.ts'), /@prisma|@\/lib\/prisma|NextRequest|NextResponse/, '单位领域规则必须保持纯 TypeScript')
}

async function main() {
  const [
    { prisma },
    unitCatalog,
    bomEntryUnits,
    { unitFieldsSchema },
    { UnitConfigurationError },
    unitRules,
    unitCommands,
    { listConfiguredUnits },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/unit-catalog'),
    import('../lib/bom-entry-units'),
    import('../modules/configuration/contracts/unit-schema'),
    import('../modules/configuration/domain/unit-errors'),
    import('../modules/configuration/domain/unit-rules'),
    import('../modules/configuration/server/unit-command-service'),
    import('../modules/configuration/server/unit-query-service'),
  ])

  try {
    verifyStaticBoundaries()
    const {
      baseUnitByMeasure,
      convertUnitValue,
      findCatalogUnit,
      normalizeCustomUnit,
      normalizeUnitCode,
      presetUnitCatalog,
    } = unitCatalog
    const {
      bomStoredQuantityToEntry,
      convertBomEntryQuantity,
      defaultBomEntryUnit,
      normalizeBomEntryQuantity,
    } = bomEntryUnits

    assert.equal(baseUnitByMeasure.LENGTH, 'm')
    assert.equal(baseUnitByMeasure.WEIGHT, 'kg')
    assert.equal(baseUnitByMeasure.QUANTITY, '件')
    assert.equal(normalizeUnitCode(' MM '), 'mm')
    assert.equal(unitFieldsSchema.safeParse({ code: '', name: '空编码', measureType: 'LENGTH', toBaseFactor: 1 }).success, false)
    assert.equal(unitRules.sameUnitIdentity({ code: ' FT ', measureType: 'LENGTH' }, { code: 'ft', measureType: 'LENGTH' }), true)

    const millimeter = findCatalogUnit(presetUnitCatalog, 'LENGTH', 'MM')
    const meter = findCatalogUnit(presetUnitCatalog, 'LENGTH', 'm')
    assert.ok(millimeter)
    assert.ok(meter)
    assert.equal(convertUnitValue(350, millimeter, meter), 0.35)

    const gram = findCatalogUnit(presetUnitCatalog, 'WEIGHT', 'g')
    const kilogram = findCatalogUnit(presetUnitCatalog, 'WEIGHT', 'kg')
    assert.ok(gram)
    assert.ok(kilogram)
    assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'LENGTH', stockUnit: 'm' }), 'mm')
    assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'WEIGHT', stockUnit: 'kg' }), 'g')
    assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'LENGTH', stockUnit: 'm' }, 'cm'), 'cm')
    assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'WEIGHT', stockUnit: 'kg' }, 'kg'), 'kg')
    assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'LENGTH', stockUnit: 'm' }, 'invalid'), 'mm')
    assert.deepEqual(normalizeBomEntryQuantity({
      quantity: 31.6,
      entryUnit: 'mm',
      material: { primaryMeasure: 'LENGTH', stockUnit: 'm' },
      catalog: presetUnitCatalog,
    }), { quantity: 0.0316, unit: 'm', entryUnit: 'mm' })
    assert.deepEqual(normalizeBomEntryQuantity({
      quantity: 250,
      entryUnit: 'g',
      material: { primaryMeasure: 'WEIGHT', stockUnit: 'kg' },
      catalog: presetUnitCatalog,
    }), { quantity: 0.25, unit: 'kg', entryUnit: 'g' })
    assert.equal(bomStoredQuantityToEntry({
      quantity: 0.0316,
      entryUnit: 'mm',
      material: { primaryMeasure: 'LENGTH', stockUnit: 'm' },
      catalog: presetUnitCatalog,
    }), 31.6)
    assert.equal(convertBomEntryQuantity(1, 'm', 'mm', { primaryMeasure: 'LENGTH', stockUnit: 'm' }, presetUnitCatalog), 1000)
    assert.throws(() => normalizeBomEntryQuantity({
      quantity: 1,
      entryUnit: '根',
      material: { primaryMeasure: 'QUANTITY', stockUnit: '件' },
      catalog: presetUnitCatalog,
    }), /必须使用主库存单位/)

    assert.deepEqual(normalizeCustomUnit({
      code: ' FT ', name: ' 英尺 ', measureType: 'LENGTH', toBaseFactor: 0.3048,
    }), { code: 'ft', name: '英尺', measureType: 'LENGTH', toBaseFactor: 0.3048 })

    await prisma.systemSetting.deleteMany({ where: { key: { in: ['units.customCatalog', 'units.displayOrder'] } } })
    const created = await unitCommands.createConfiguredUnit({
      code: ' FT ', name: ' 英尺 ', measureType: 'LENGTH', toBaseFactor: 0.3048,
    })
    assert.deepEqual(created, { code: 'ft', name: '英尺', measureType: 'LENGTH', toBaseFactor: 0.3048 })
    await assert.rejects(
      () => unitCommands.createConfiguredUnit({ code: 'FT', name: '重复英尺', measureType: 'LENGTH', toBaseFactor: 0.3048 }),
      (error: unknown) => error instanceof UnitConfigurationError && error.status === 409,
      '同量纲单位编码必须忽略英文字母大小写判重',
    )
    await assert.rejects(
      () => unitCommands.updateConfiguredUnit({
        originalCode: 'mm', originalMeasureType: 'LENGTH',
        code: 'mm', name: '预置毫米', measureType: 'LENGTH', toBaseFactor: 0.001,
      }),
      (error: unknown) => error instanceof UnitConfigurationError && error.status === 404,
      '预置单位不得通过自定义单位命令修改',
    )

    await prisma.material.create({
      data: {
        code: 'UNIT-VERIFY-MAT', name: '单位验证物料', unit: 'ft',
        primaryMeasure: 'LENGTH', stockUnit: 'ft', referenceMeasure: 'WEIGHT', valuationUnit: 'kg',
      },
    })
    const renamed = await unitCommands.updateConfiguredUnit({
      originalCode: 'ft', originalMeasureType: 'LENGTH',
      code: 'ft', name: '英尺（ft）', measureType: 'LENGTH', toBaseFactor: 0.3048,
    })
    assert.equal(renamed.usageCount, 1)
    assert.equal(renamed.saved.name, '英尺（ft）')
    await assert.rejects(
      () => unitCommands.updateConfiguredUnit({
        originalCode: 'ft', originalMeasureType: 'LENGTH',
        code: 'yd', name: '码', measureType: 'LENGTH', toBaseFactor: 0.9144,
      }),
      /只能修改显示名称/,
      '已使用单位不得修改编码、量纲或换算系数',
    )
    await assert.rejects(
      () => unitCommands.deleteConfiguredUnit({ code: 'ft', measureType: 'LENGTH' }),
      /不能删除/,
      '已使用单位不得删除',
    )

    await unitCommands.createConfiguredUnit({ code: 'yd', name: '码', measureType: 'LENGTH', toBaseFactor: 0.9144 })
    const deleted = await unitCommands.deleteConfiguredUnit({ code: 'YD', measureType: 'LENGTH' })
    assert.equal(deleted.code, 'yd')
    const listed = await listConfiguredUnits()
    const foot = listed.find((unit) => unit.measureType === 'LENGTH' && unit.code === 'ft')
    assert.deepEqual(
      [foot?.name, foot?.usedByMaterialCount, foot?.usedByBomCount, foot?.usageCount],
      ['英尺（ft）', 1, 0, 1],
      '单位查询必须统一装配目录和物料/BOM 使用量',
    )
    assert.equal(listed.some((unit) => unit.measureType === 'LENGTH' && unit.code === 'yd'), false)

    console.log('单位配置模块验证通过：换算、BOM 录入、校验、判重、预置保护、使用锁定、删除和使用量汇总符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
