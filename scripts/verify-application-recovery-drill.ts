import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const root = process.cwd()

async function main() {
  const productionBuild = await stat(path.join(root, '.next', 'BUILD_ID')).catch(() => null)
  assert.ok(productionBuild?.isFile(), '应用级恢复演练需要生产构建；请先运行 npm run build')
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mes-lite-application-drill-'))
  const sourceDirectory = path.join(temporaryRoot, 'source')
  const sourceDatabase = path.join(sourceDirectory, 'data', 'mes_lite.db')
  const sourceUploads = path.join(sourceDirectory, 'uploads')
  const attachmentRelativePath = path.join('MATERIAL', 'material-1', 'drawing.txt')
  const attachmentPath = path.join(sourceUploads, attachmentRelativePath)
  const candidateRoot = path.join(temporaryRoot, 'candidate')
  const reportPath = path.join(temporaryRoot, 'reports', 'application.md')
  const databaseUrl = `file:${sourceDatabase}`

  try {
  await mkdir(path.dirname(sourceDatabase), { recursive: true })
  await mkdir(path.dirname(attachmentPath), { recursive: true })
  await writeFile(attachmentPath, 'MES-lite application recovery attachment\n')
  execFileSync(path.join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
    stdio: 'pipe',
  })
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const material = await prisma.material.create({ data: { code: 'RECOVERY-MAT-001', name: '恢复演练物料', category: 'FINISHED', unit: '件' } })
  const product = await prisma.product.create({ data: { sku: 'RECOVERY-MAT-001', name: material.name, category: 'FINISHED', unit: '件', materialId: material.id } })
  const location = await prisma.inventoryLocation.create({ data: { code: 'RECOVERY-LOC-001', name: '恢复演练库位', isDefault: true } })
  await prisma.stock.create({ data: {
    materialId: material.id, qty: 1, availableQty: 1, valuationQty: 1, availableValuationQty: 1,
    locationBalances: { create: { locationId: location.id, qty: 1, availableQty: 1 } },
  } })
  await prisma.productionOrder.create({ data: { orderNo: 'RECOVERY-PO-001', productId: product.id, materialId: material.id, planQty: 1, status: 'DRAFT' } })
  await prisma.documentAttachment.create({ data: {
    ownerType: 'MATERIAL', ownerId: material.id, documentType: 'ORIGINAL',
    originalName: 'drawing.txt', fileName: 'drawing.txt', mimeType: 'text/plain',
    size: Buffer.byteLength('MES-lite application recovery attachment\n'),
    url: '/uploads/MATERIAL/material-1/drawing.txt',
    storagePath: `/app/public/uploads/${attachmentRelativePath.split(path.sep).join('/')}`,
  } })
  await prisma.$disconnect()

  const sourceCreatedAt = new Date(Date.now() - 1_000).toISOString()
  const output = execFileSync(path.join(root, 'node_modules', '.bin', 'tsx'), [
    'scripts/application-recovery-drill.ts',
    '--database', sourceDatabase,
    '--uploads', sourceUploads,
    '--target', candidateRoot,
    '--report', reportPath,
    '--environment', 'isolated-ci',
    '--operator', 'application-verifier',
    '--source-created-at', sourceCreatedAt,
    '--rpo-hours', '24',
    '--rto-minutes', '60',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const result = JSON.parse(output)
  assert.equal(result.status, 'APPLICATION_PASS')
  assert.equal(result.sourceUploadFiles, 1)
  assert.deepEqual(result.counts, { materials: 1, stocks: 1, productionOrders: 1, attachments: 1 })
  assert.ok(Object.values(result.checks).every((check: any) => check.status === 'PASS'))
  assert.equal(await readFile(path.join(candidateRoot, 'uploads', attachmentRelativePath), 'utf8'), 'MES-lite application recovery attachment\n')

  const candidate = new PrismaClient({ datasources: { db: { url: `file:${path.join(candidateRoot, 'data', 'mes_lite.db')}` } } })
  assert.equal(await candidate.operator.count({ where: { username: { startsWith: 'recovery-drill-' } } }), 0, '隔离临时管理员必须清理')
  await candidate.$disconnect()
  const report = await readFile(reportPath, 'utf8')
  assert.match(report, /隔离应用恢复验收通过/)
  assert.match(report, /附件原文件通过 API 返回并与源文件 SHA-256 一致/)
  assert.match(report, /完整应用 RTO/)
  assert.doesNotMatch(report, /RECOVERY-MAT-001|RECOVERY-PO-001|drawing\.txt|recovery-drill-/, '报告不得泄露业务明细或临时账号')

  const overwrite = spawnSync(path.join(root, 'node_modules', '.bin', 'tsx'), [
    'scripts/application-recovery-drill.ts',
    '--database', sourceDatabase,
    '--uploads', sourceUploads,
    '--target', candidateRoot,
    '--report', path.join(temporaryRoot, 'reports', 'second.md'),
    '--environment', 'isolated-ci',
    '--operator', 'application-verifier',
  ], { cwd: root, encoding: 'utf8' })
  assert.notEqual(overwrite.status, 0)
  assert.match(overwrite.stderr, /输出已存在，拒绝覆盖/)
  assert.ok((await stat(sourceDatabase)).isFile(), '演练不得删除或改写源候选')

    console.log('应用级恢复演练验证通过：非覆盖候选、迁移、readiness、登录、业务/附件抽查、账号清理与证据脱敏均符合预期。')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
