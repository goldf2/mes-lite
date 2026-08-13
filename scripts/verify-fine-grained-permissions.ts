import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-granular-permissions-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
const read = (path: string) => readFileSync(join(root, path), 'utf8')

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [{ prisma }, permissions] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/permissions'),
  ])

  try {
    const operator = await prisma.operator.create({
      data: { username: 'legacy-granular', passwordHash: 'verify', name: '旧个人例外', role: 'OPERATOR', status: 'ACTIVE' },
    })
    await prisma.permissionSetting.createMany({ data: [
      { role: 'OPERATOR', resource: 'system', canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
      { role: 'OPERATOR', resource: 'stats', canRead: true, canCreate: true, canUpdate: false, canDelete: false, canGrant: false },
      { role: 'OPERATOR', resource: 'bomCost', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false },
      { role: 'OPERATOR', resource: 'workInstructions', canRead: true, canCreate: false, canUpdate: false, canDelete: true, canGrant: false },
    ] })
    const customGroup = await prisma.permissionGroup.create({
      data: {
        code: 'legacy_custom', name: '旧自定义组',
        settings: { create: [
          { resource: 'system', canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
          { resource: 'stats', canRead: true, canCreate: true, canUpdate: false, canDelete: false, canGrant: false },
          { resource: 'bomCost', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false },
          { resource: 'workInstructions', canRead: true, canCreate: false, canUpdate: false, canDelete: true, canGrant: false },
        ] },
      },
    })
    const customizedBuiltinGroup = await prisma.permissionGroup.create({
      data: {
        code: 'production_executor', name: '企业已修改生产组', isSystem: true,
        settings: { create: [
          { resource: 'system', canRead: false, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
          { resource: 'stats', canRead: true, canCreate: false, canUpdate: false, canDelete: false, canGrant: false },
          { resource: 'bomCost', canRead: false, canCreate: true, canUpdate: false, canDelete: false, canGrant: false },
        ] },
      },
    })
    await prisma.operatorPermissionOverride.createMany({ data: [
      { operatorId: operator.id, resource: 'system', canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
      { operatorId: operator.id, resource: 'stats', canRead: true, canCreate: true, canUpdate: false, canDelete: false, canGrant: false },
      { operatorId: operator.id, resource: 'bomCost', canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false },
    ] })

    await permissions.ensureDefaultPermissions()
    assert.equal(permissions.permissionResources.length, 48, '权限资源应由 30 个增加为 48 个')

    const roleMap = await permissions.getRolePermissionMap('OPERATOR')
    assert.deepEqual(roleMap.suppliers, roleMap.system, '旧角色 system 必须继承到供应商资源')
    assert.deepEqual(roleMap.aiSettings, roleMap.system, '旧角色 system 必须继承到 AI 设置资源')
    assert.deepEqual(roleMap.flowTransfers, roleMap.stats, '旧角色 stats 必须继承到流程转移资源')
    assert.deepEqual(roleMap.bom, roleMap.bomCost, '旧角色 bomCost 必须继承到 BOM 结构资源')
    assert.deepEqual(roleMap.documentCategories, roleMap.workInstructions, '旧角色文档权限必须继承到文档类别')

    const groupSettings = await prisma.permissionGroupSetting.findMany({ where: { groupId: customGroup.id } })
    const groupMap = new Map(groupSettings.map((setting) => [setting.resource, setting]))
    assert.equal(groupSettings.length, 48, '旧自定义组必须补齐全部新资源')
    assert.equal(groupMap.get('customers')?.canUpdate, true, '旧自定义组 system.update 必须继承到客户资料')
    assert.equal(groupMap.get('flowTransfers')?.canCreate, true, '旧自定义组 stats.create 必须继承到流程转移')
    assert.equal(groupMap.get('bom')?.canUpdate, true, '旧自定义组 BOM 更新权限必须继承')

    const builtinSettings = await prisma.permissionGroupSetting.findMany({ where: { groupId: customizedBuiltinGroup.id } })
    const builtinMap = new Map(builtinSettings.map((setting) => [setting.resource, setting]))
    assert.equal(builtinMap.get('flowTransfers')?.canRead, true, '已修改预置组必须继承当前 stats.read')
    assert.equal(builtinMap.get('flowTransfers')?.canCreate, false, '已修改预置组不得按新版预置额外获得流程转移创建')
    assert.equal(builtinMap.get('suppliers')?.canUpdate, true, '已修改预置组必须继承当前 system.update')
    assert.equal(builtinMap.get('bom')?.canCreate, true, '已修改预置组必须继承当前 bomCost.create')

    const overrides = await prisma.operatorPermissionOverride.findMany({ where: { operatorId: operator.id } })
    const overrideMap = new Map(overrides.map((setting) => [setting.resource, setting]))
    assert.equal(overrideMap.get('dataTools')?.canUpdate, true, '旧 system 个人例外必须继承到数据工具')
    assert.equal(overrideMap.get('flowTransfers')?.canCreate, true, '旧 stats 个人例外必须继承到流程转移')
    assert.equal(overrideMap.get('bom')?.canUpdate, true, '旧 BOM 个人例外必须继承到 BOM 结构')

    const processGroup = await prisma.permissionGroup.findUnique({ where: { code: 'process_engineer' }, include: { settings: true } })
    const processMap = new Map(processGroup?.settings.map((setting) => [setting.resource, setting]))
    assert.equal(processMap.get('bom')?.canUpdate, true, '工艺技术组必须能维护 BOM')
    assert.equal(processMap.get('aiSettings')?.canRead, false, '工艺技术组不得读取 AI 配置')

    const registry = read('lib/page-registry.ts')
    assert.doesNotMatch(registry, /resource: 'system'/, '页面注册不得继续使用 system 宽资源')
    assert.match(registry, /key: 'flowTransfers'[\s\S]*resource: 'flowTransfers'/, '流程转移页面必须使用独立资源')
    assert.match(registry, /key: 'bomWorkspace'[\s\S]*resource: 'bom'/, 'BOM 设置必须使用 BOM 结构资源')
    assert.match(read('lib/ai-agent/tools.ts'), /resource: 'bom'[\s\S]*name: 'query_boms'/, 'AI BOM 工具必须使用 BOM 结构资源')
    assert.match(read('modules/attachments/domain/attachment-policy.ts'), /FLOW_TRANSFER: \{ resource: 'flowTransfers' \}/, '流程转移附件必须继承流程转移资源')
    assert.match(read('modules/business-documents/domain/business-document-definition.ts'), /'flow-transfer': \{ permissionResource: 'flowTransfers'/, '流程转移打印必须继承流程转移资源')
    assert.match(read('modules/bom/ui/BomDraftEditor.tsx'), /fieldset disabled=\{!editable \|\| !canEditCurrent\}/, 'BOM 只读岗位必须禁用两个编辑字段区')

    console.log('细粒度权限迁移验证通过：48 个资源、旧角色/自定义组/个人例外一次性继承及页面/AI/附件映射均符合契约。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  rmSync(verifyRoot, { recursive: true, force: true })
  process.exit(1)
})
