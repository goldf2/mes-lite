import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-document-categories-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

function verifyStaticBoundaries() {
  const requiredModuleFiles = [
    'modules/documents/client/documents-api.ts',
    'modules/documents/contracts/document-category-schema.ts',
    'modules/documents/domain/document-category-errors.ts',
    'modules/documents/domain/document-category-rules.ts',
    'modules/documents/http/document-category-http-errors.ts',
    'modules/documents/server/document-category-command-service.ts',
    'modules/documents/server/document-category-query-service.ts',
    'modules/documents/ui/DocumentCategoryManagerPanel.tsx',
    'modules/documents/ui/DocumentCategorySettingsPage.tsx',
  ]
  for (const path of requiredModuleFiles) assert.ok(existsSync(join(root, path)), `文档领域缺少类别模块文件：${path}`)
  for (const path of [
    'lib/document-categories.ts',
    'app/components/DocumentCategoryManagerModal.tsx',
    'modules/configuration/ui/DocumentCategorySettingsPage.tsx',
  ]) assert.equal(existsSync(join(root, path)), false, `不得保留文档类别并行实现：${path}`)

  const route = read('app/api/document-categories/route.ts')
  const page = read('modules/documents/ui/DocumentCategorySettingsPage.tsx')
  const panel = read('modules/documents/ui/DocumentCategoryManagerPanel.tsx')
  const client = read('modules/documents/client/documents-api.ts')
  const renderer = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
  const documentsIndex = read('modules/documents/index.ts')
  const configurationIndex = read('modules/configuration/index.ts')

  assert.ok(route.split('\n').length <= 75, '文档类别 API 应保持为不超过 75 行的 HTTP 适配层')
  assert.doesNotMatch(route, /@\/lib\/prisma|@\/lib\/document-categories|\bprisma\.|\$transaction|validateParent|validateDuplicate/, '文档类别 API 不得访问 Prisma、旧 lib 或承载领域规则')
  assert.match(route, /@\/modules\/documents\//, '文档类别 API 必须委托文档领域')
  assert.match(page, /<ResourcePageShell\b/, '树形文档类别必须复用公共 ResourcePageShell')
  assert.doesNotMatch(`${page}\n${panel}`, /\bfetch\(/, '文档类别 UI 不得直接调用 fetch')
  assert.match(page, /listDocumentCategories\(/, '文档类别页必须通过文档领域 client 读取资料')
  assert.match(panel, /saveDocumentCategory|removeDocumentCategory/, '文档类别管理面板必须通过领域 client 写入资料')
  assert.match(panel, /<AppButton\b/, '文档类别操作必须复用公共 AppButton')
  assert.match(panel, /<SearchableSelect\b/, '文档类别父级选择必须复用公共 SearchableSelect')
  assert.match(client, /saveDocumentCategory|removeDocumentCategory/, '文档领域 client 必须集中类别增删改请求')
  assert.match(renderer, /import\('@\/modules\/documents'\).*DocumentCategorySettingsPage/, '渲染注册表必须从文档领域公开入口加载类别页面')
  assert.match(documentsIndex, /DocumentCategorySettingsPage/, '文档领域必须公开类别设置页面')
  assert.doesNotMatch(configurationIndex, /DocumentCategorySettingsPage/, '业务配置不得重新导出文档领域页面')

  const services = [
    read('modules/documents/server/document-category-command-service.ts'),
    read('modules/documents/server/document-category-query-service.ts'),
  ].join('\n')
  assert.doesNotMatch(services, /NextRequest|NextResponse|requireResourcePermission|writeAuditLog/, '文档类别服务不得依赖 HTTP、权限或请求审计')
  assert.doesNotMatch(read('modules/documents/domain/document-category-rules.ts'), /@prisma|@\/lib\/prisma|NextRequest|NextResponse/, '文档类别规则必须保持纯 TypeScript')
}

async function main() {
  const [
    { prisma },
    { documentCategoryFieldsSchema },
    { DocumentCategoryError },
    categoryRules,
    categoryCommands,
    { listManagedDocumentCategories },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/documents/contracts/document-category-schema'),
    import('../modules/documents/domain/document-category-errors'),
    import('../modules/documents/domain/document-category-rules'),
    import('../modules/documents/server/document-category-command-service'),
    import('../modules/documents/server/document-category-query-service'),
  ])

  try {
    verifyStaticBoundaries()
    assert.equal(documentCategoryFieldsSchema.safeParse({ name: '  ' }).success, false)
    assert.equal(categoryRules.normalizeDocumentCategoryName('  作业   指导书  '), '作业 指导书')

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const existingRoots = (await listManagedDocumentCategories()).filter((category) => !category.parentId)
    const previousRootSort = Math.max(0, ...existingRoots.map((category) => category.sortOrder))
    const rootCategory = await categoryCommands.createManagedDocumentCategory({ name: `  作业   指导书 ${suffix}  ` })
    const secondRoot = await categoryCommands.createManagedDocumentCategory({ name: `检验文件 ${suffix}` })
    const childCategory = await categoryCommands.createManagedDocumentCategory({ name: '机床作业', parentId: rootCategory.id })
    assert.deepEqual(
      [rootCategory.name, rootCategory.sortOrder, secondRoot.sortOrder, childCategory.sortOrder],
      [`作业 指导书 ${suffix}`, previousRootSort + 10, previousRootSort + 20, 10],
      '类别名称应规范化，一级与各自二级类别应独立递增排序',
    )

    const listed = await listManagedDocumentCategories()
    const listedRoot = listed.find((category) => category.id === rootCategory.id)
    const listedChild = listed.find((category) => category.id === childCategory.id)
    assert.deepEqual(
      [listedRoot?._count.children, listedChild?.parent?.id, listedChild?.parent?.name],
      [1, rootCategory.id, rootCategory.name],
      '查询服务必须统一装配父级和引用数量',
    )
    assert.equal(categoryRules.documentCategoryLabel(listedChild!), `作业 指导书 ${suffix} / 机床作业`)
    assert.deepEqual(categoryRules.documentCategoryOptions(listed).map((option) => option.label).filter((label) => label.includes(suffix)), [
      `作业 指导书 ${suffix}`, `作业 指导书 ${suffix} / 机床作业`, `检验文件 ${suffix}`,
    ])

    await assert.rejects(
      () => categoryCommands.createManagedDocumentCategory({ name: `作业 指导书 ${suffix}` }),
      (error: unknown) => error instanceof DocumentCategoryError && error.status === 409,
      '同层一级类别不得重名',
    )
    await assert.rejects(
      () => categoryCommands.createManagedDocumentCategory({ name: '机床作业', parentId: rootCategory.id }),
      (error: unknown) => error instanceof DocumentCategoryError && error.status === 409,
      '同一父级下二级类别不得重名',
    )
    await assert.rejects(
      () => categoryCommands.createManagedDocumentCategory({ name: '三级类别', parentId: childCategory.id }),
      (error: unknown) => error instanceof DocumentCategoryError && error.status === 400,
      '文档类别最多允许两级',
    )
    await assert.rejects(
      () => categoryCommands.updateManagedDocumentCategory({ id: childCategory.id, name: childCategory.name, parentId: childCategory.id }),
      /类别不能以自身作为上级/,
    )
    await assert.rejects(
      () => categoryCommands.updateManagedDocumentCategory({ id: rootCategory.id, name: rootCategory.name, parentId: secondRoot.id }),
      (error: unknown) => error instanceof DocumentCategoryError && error.status === 409,
      '含有下级的一级类别不得变成二级类别',
    )

    const renamed = await categoryCommands.updateManagedDocumentCategory({
      id: childCategory.id, name: '  机床   标准作业  ', parentId: secondRoot.id,
    })
    assert.deepEqual(
      [renamed.before.parentId, renamed.saved.name, renamed.saved.parent?.id],
      [rootCategory.id, '机床 标准作业', secondRoot.id],
      '更新必须返回审计前快照并保存规范化名称和新父级',
    )

    const material = await prisma.material.create({
      data: { code: `DOCUMENT-CATEGORY-VERIFY-${suffix}`, name: '文档类别验证物料', category: 'FINISHED', unit: '件' },
    })
    const document = await prisma.workInstruction.create({
      data: { title: '文档类别引用保护验证', materialId: material.id, categoryId: childCategory.id },
    })
    await assert.rejects(
      () => categoryCommands.deleteManagedDocumentCategory(childCategory.id),
      (error: unknown) => error instanceof DocumentCategoryError && error.status === 409,
      '被产品文档引用的类别不得删除',
    )
    await assert.rejects(
      () => categoryCommands.deleteManagedDocumentCategory(secondRoot.id),
      (error: unknown) => error instanceof DocumentCategoryError && error.status === 409,
      '含有下级类别的一级类别不得删除',
    )

    await prisma.workInstruction.delete({ where: { id: document.id } })
    await prisma.material.delete({ where: { id: material.id } })
    await categoryCommands.deleteManagedDocumentCategory(childCategory.id)
    await categoryCommands.deleteManagedDocumentCategory(rootCategory.id)
    await categoryCommands.deleteManagedDocumentCategory(secondRoot.id)
    const remainingIds = new Set((await listManagedDocumentCategories()).map((category) => category.id))
    assert.equal([rootCategory.id, secondRoot.id, childCategory.id].some((id) => remainingIds.has(id)), false)

    console.log('文档类别模块验证通过：领域归属、薄路由、公共页面骨架、两级层次、判重、更新和引用保护符合预期')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
