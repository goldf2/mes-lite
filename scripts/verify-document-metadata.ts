import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-document-metadata-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

const migration = spawnSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  encoding: 'utf8',
})
if (migration.status !== 0) throw new Error(`${migration.stdout}\n${migration.stderr}`)
process.env.DATABASE_URL = databaseUrl
process.env.ATTACHMENT_UPLOAD_DIR = join(verifyRoot, 'uploads')

function verifyStructure() {
  const requiredFiles = [
    'modules/documents/contracts/document-field-schema.ts',
    'modules/documents/domain/document-field-rules.ts',
    'modules/documents/server/document-field-command-service.ts',
    'modules/documents/server/document-field-query-service.ts',
    'modules/documents/server/work-instruction-bulk-service.ts',
    'modules/documents/server/work-instruction-batch-import-service.ts',
    'modules/documents/ui/DocumentFieldManagerDialog.tsx',
    'modules/documents/ui/DocumentExtensionFields.tsx',
    'modules/documents/ui/WorkInstructionBatchImportDialog.tsx',
    'modules/documents/ui/WorkInstructionBulkEditDialog.tsx',
    'modules/documents/ui/useWorkInstructionMetadataActions.tsx',
    'app/api/document-field-definitions/route.ts',
    'app/api/work-instructions/batch-import/route.ts',
    'app/api/work-instructions/bulk/route.ts',
    'prisma/migrations/20260820213000_add_document_extension_fields/migration.sql',
  ]
  for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `缺少文档元数据能力：${path}`)

  const schema = read('prisma/schema.prisma')
  const migration = read('prisma/migrations/20260820213000_add_document_extension_fields/migration.sql')
  const fieldRoute = read('app/api/document-field-definitions/route.ts')
  const batchRoute = read('app/api/work-instructions/batch-import/route.ts')
  const bulkRoute = read('app/api/work-instructions/bulk/route.ts')
  const collection = read('modules/documents/ui/WorkInstructionCollectionView.tsx')
  const page = read('modules/documents/ui/WorkInstructionPage.tsx')
  const metadataActions = read('modules/documents/ui/useWorkInstructionMetadataActions.tsx')
  const fieldManager = read('modules/documents/ui/DocumentFieldManagerDialog.tsx')
  const batchDialog = read('modules/documents/ui/WorkInstructionBatchImportDialog.tsx')
  const bulkDialog = read('modules/documents/ui/WorkInstructionBulkEditDialog.tsx')

  assert.match(schema, /model DocumentFieldDefinition[\s\S]*model WorkInstructionFieldValue/, 'Schema 必须使用字段定义和值表，不能动态改列')
  assert.match(schema, /fieldDefinitionId[\s\S]*onDelete: Restrict/, '被使用字段必须由数据库外键保护')
  assert.match(migration, /CREATE TABLE "DocumentFieldDefinition"[\s\S]*CREATE TABLE "WorkInstructionFieldValue"/, '迁移必须创建字段定义和值表')
  assert.match(fieldRoute, /requireResourcePermission\('documentCategories'/, '扩展字段配置必须复用文档类别权限')
  assert.match(batchRoute, /workInstructions[\s\S]*attachments[\s\S]*BATCH_IMPORT/, '批量导入必须同时校验文档和附件权限并审计')
  assert.match(bulkRoute, /workInstructions[\s\S]*BULK_UPDATE/, '批量修改必须校验文档权限并审计')
  assert.match(collection, /type="checkbox"[\s\S]*selectedIds/, '文档集合必须支持多选')
  assert.match(page, /useWorkInstructionMetadataActions/, '文档主页必须将元数据动作拆出编排层')
  assert.match(metadataActions, /批量导入[\s\S]*字段设置[\s\S]*批量修改/, '文档库必须提供三个明确入口')
  assert.match(fieldManager, /基础字段[\s\S]*不可删除[\s\S]*扩展字段/, '字段管理必须区分不可删除基础字段和扩展字段')
  assert.match(fieldManager, /_count\.values[\s\S]*disabled/, '被使用扩展字段必须禁用删除')
  assert.match(batchDialog, /multiple[\s\S]*每个文件将独立创建/, '批量导入必须明确一文件一文档')
  assert.match(bulkDialog, /应用此字段[\s\S]*同一类别/, '批量修改必须显式选择应用字段并说明类别边界')
}

async function verifyDatabaseBehavior() {
  const [{ prisma }, fieldCommands, { listDocumentFieldDefinitions }, instructionCommands, { bulkUpdateWorkInstructions }, { batchImportWorkInstructions }, { DocumentFieldError }] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/documents/server/document-field-command-service'),
    import('../modules/documents/server/document-field-query-service'),
    import('../modules/documents/server/work-instruction-command-service'),
    import('../modules/documents/server/work-instruction-bulk-service'),
    import('../modules/documents/server/work-instruction-batch-import-service'),
    import('../modules/documents/domain/document-field-errors'),
  ])
  try {
    const category = await prisma.documentCategory.create({ data: { name: '批量图纸' } })
    const otherCategory = await prisma.documentCategory.create({ data: { name: '检验文件' } })
    const material = await prisma.material.create({ data: { code: 'META-VERIFY', name: '元数据验证产品', unit: '件', category: 'FINISHED' } })
    const textField = await fieldCommands.createDocumentFieldDefinition({ categoryId: category.id, name: '材料牌号', fieldType: 'TEXT', options: [] })
    const selectField = await fieldCommands.createDocumentFieldDefinition({ categoryId: category.id, name: '保密等级', fieldType: 'SELECT', options: ['公开', '内部'] })
    const unusedField = await fieldCommands.createDocumentFieldDefinition({ categoryId: category.id, name: '待删除', fieldType: 'DATE', options: [] })
    await fieldCommands.deleteDocumentFieldDefinition(unusedField.id)

    const first = await instructionCommands.createWorkInstruction({
      title: '图纸 A', categoryId: category.id, materialId: material.id, workCenterIds: [], contentJson: null,
      fieldValues: { [textField.id]: 'SUS304', [selectField.id]: '内部' },
    })
    const second = await instructionCommands.createWorkInstruction({
      title: '图纸 B', categoryId: category.id, materialId: null, workCenterIds: [], contentJson: null,
      fieldValues: { [textField.id]: '45#' },
    })
    assert.deepEqual(first.fieldValues.map((value) => value.valueText), ['SUS304', '内部'], '新建文档必须保存分类扩展字段')
    assert.equal((await listDocumentFieldDefinitions(category.id)).find((field) => field.id === textField.id)?._count.values, 2, '字段使用数必须反映已填写文档')
    await assert.rejects(
      () => fieldCommands.deleteDocumentFieldDefinition(textField.id),
      (error: unknown) => error instanceof DocumentFieldError && error.status === 409,
      '已被使用的扩展字段不得删除',
    )

    const bulk = await bulkUpdateWorkInstructions({
      ids: [first.id, second.id],
      updates: { status: 'DRAFT', note: '统一备注', fieldValues: { [textField.id]: 'SUS316' } },
    })
    assert.equal(bulk.updated.every((instruction) => instruction.status === 'DRAFT' && instruction.note === '统一备注'), true, '批量修改必须应用勾选基础字段')
    assert.deepEqual(await prisma.workInstructionFieldValue.findMany({ where: { fieldDefinitionId: textField.id }, select: { valueText: true }, orderBy: { workInstructionId: 'asc' } }), [{ valueText: 'SUS316' }, { valueText: 'SUS316' }], '批量修改必须应用共同扩展字段')

    const other = await instructionCommands.createWorkInstruction({ title: '检验 A', categoryId: otherCategory.id, materialId: null, workCenterIds: [], contentJson: null, fieldValues: {} })
    await assert.rejects(() => bulkUpdateWorkInstructions({ ids: [first.id, other.id], updates: { status: 'ACTIVE' } }), /同一类别/, '跨类别文档不得批量修改')

    const files = [new File(['dwg-a'], 'A.dwg'), new File(['dwg-b'], 'B.dwg')]
    const imported = await batchImportWorkInstructions({
      categoryId: category.id, materialId: material.id, version: 'v1', status: 'ACTIVE', workCenterIds: [], note: '批量导入', fieldValues: { [textField.id]: 'SUS304' },
    }, files, 'verify-operator')
    assert.deepEqual([imported.imported.length, imported.failed.length], [2, 0], '合法文件必须全部导入')
    const importedRows = await prisma.workInstruction.findMany({ where: { id: { in: imported.imported.map((item) => item.instruction.id) } }, include: { fieldValues: true } })
    const importedAttachments = await prisma.documentAttachment.count({ where: { ownerId: { in: importedRows.map((item) => item.id) }, deletedAt: null } })
    assert.equal(importedRows.every((instruction) => instruction.fieldValues[0]?.valueText === 'SUS304'), true, '批量导入必须复制共同扩展字段')
    assert.equal(importedAttachments, 2, '每个导入文件必须一对一绑定独立文档')
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  try {
    verifyStructure()
    await verifyDatabaseBehavior()
    console.log('文档批量导入、分类扩展字段与批量修改验证通过。')
  } finally {
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
