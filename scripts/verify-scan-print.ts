import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLabelPrintJobSchema, createScanSessionSchema, recordScanEventSchema } from '../modules/operations-tools/contracts/scan-print'
import { classifyScan, labelPrintJobNumber, normalizeScanCode, scanCountCompletionError, scanSessionNumber } from '../modules/operations-tools/domain/scanning'
import { labelCanvasDots, labelPrintPageStyle, pc310t203Profile, pc310tDefaultLabelMedia, pc310tLabelMediaProfiles } from '../modules/operations-tools/model/label-profiles'
import { honeywell1900Profile } from '../modules/operations-tools/model/scanner-adapter'
import { createDefaultLabelData, formatScanQuantity } from '../modules/operations-tools/model/scan-print-view'

const root = process.cwd()
for (const path of [
  'modules/operations-tools/client/scan-print-api.ts',
  'modules/operations-tools/contracts/scan-print.ts',
  'modules/operations-tools/domain/scanning.ts',
  'modules/operations-tools/server/scan-session-command-service.ts',
  'modules/operations-tools/server/label-print-command-service.ts',
  'modules/operations-tools/ui/GenericLabel.tsx',
  'modules/operations-tools/ui/DocumentQrLabel.tsx',
  'modules/operations-tools/ui/DocumentQrLabelDialog.tsx',
  'modules/operations-tools/ui/DocumentScanLookupPanel.tsx',
  'modules/operations-tools/ui/ScanPrintPageModule.tsx',
]) assert.ok(existsSync(join(root, path)), `运维工具领域缺少扫码打印模块文件：${path}`)

for (const path of [
  'app/api/scan-count-sessions/route.ts',
  'app/api/scan-count-sessions/[id]/events/route.ts',
  'app/api/scan-count-sessions/[id]/complete/route.ts',
  'app/api/label-print-jobs/route.ts',
]) {
  const source = readFileSync(join(root, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction/, `${path} 不得直接访问数据库`)
  assert.ok(source.split('\n').length <= 60, `${path} 必须保持为不超过 60 行的 HTTP 适配层`)
}

const scanPageSource = readFileSync(join(root, 'modules/operations-tools/ui/ScanPrintPageModule.tsx'), 'utf8')
const registrySource = readFileSync(join(root, 'app/components/shell/WorkspacePageRendererRegistry.tsx'), 'utf8')
assert.ok(scanPageSource.split('\n').length <= 450, '扫码打印协调页应保持在 450 行内')
assert.doesNotMatch(scanPageSource, /\bfetch\(/, '扫码打印页不得直接调用 fetch')
assert.match(scanPageSource, /loadGeneralScanSessions\(/, '扫码打印页必须通过运维工具 client 读取会话')
assert.match(registrySource, /ScanPrintPageModule/, '扫码打印页必须通过运维工具模块公开入口加载')
assert.match(scanPageSource, /DocumentScanLookupPanel/, '扫码打印页必须提供单据码解析入口')
assert.equal(existsSync(join(root, 'app/components/ScanPrintPage.tsx')), false, '根组件目录不得保留扫码打印领域页')

assert.equal(normalizeScanCode(' mat-P12-001\r\n'), 'P12-001')
assert.deepEqual(classifyScan({ rawValue: 'P12-001', expectedCode: 'MAT-P12-001', countedQty: 0, expectedQty: 2, quantity: 1 }), { code: 'P12-001', result: 'MATCHED' })
assert.equal(classifyScan({ rawValue: 'OTHER', expectedCode: 'P12-001', countedQty: 0, expectedQty: 2, quantity: 1 }).result, 'UNKNOWN')
assert.equal(classifyScan({ rawValue: 'P12-001', expectedCode: 'P12-001', countedQty: 2, expectedQty: 2, quantity: 1 }).result, 'OVER')
assert.equal(scanCountCompletionError({ countedQty: 2, expectedQty: 2 }), null)
assert.match(scanCountCompletionError({ countedQty: 1, expectedQty: 2 }) || '', /不一致/)
assert.equal(scanSessionNumber(new Date('2026-08-10T01:02:03Z'), 0.5), 'SC-20260810010203-I')
assert.equal(labelPrintJobNumber(new Date('2026-08-10T01:02:03Z'), 0.5), 'LP-20260810010203-I')

assert.equal(pc310tDefaultLabelMedia.widthMm, 105)
assert.equal(pc310tDefaultLabelMedia.heightMm, 70)
assert.equal(pc310tLabelMediaProfiles.some((media) => media.id === '100X150'), true)
assert.deepEqual(labelCanvasDots(pc310tDefaultLabelMedia), { width: 840, height: 560 })
assert.match(labelPrintPageStyle(pc310tDefaultLabelMedia), /size: 105mm 70mm/)
assert.equal(pc310t203Profile.dpi, 203)
assert.equal(honeywell1900Profile.inputMode, 'USB HID Keyboard')
assert.equal(formatScanQuantity(12.34), '12.34')
assert.equal(createDefaultLabelData().code, 'TEST-001')

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-scan-print-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe',
})
process.env.DATABASE_URL = databaseUrl

async function main() {
  const [
    { prisma },
    { createScanSession, recordScanEvent, undoLastMatchedScan, completeScanSession },
    { listScanSessions },
    { createLabelPrintJob },
    { ScanPrintServiceError },
  ] = await Promise.all([
    import('../lib/prisma'),
    import('../modules/operations-tools/server/scan-session-command-service'),
    import('../modules/operations-tools/server/scan-session-query-service'),
    import('../modules/operations-tools/server/label-print-command-service'),
    import('../modules/operations-tools/domain/scan-print-errors'),
  ])

  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const auditContext = {
      operatorId: 'verify-scan-count', operatorName: '扫码盘点审计验证员',
      ipAddress: undefined, userAgent: undefined,
    }
    const sessionInput = createScanSessionSchema.parse({
      clientRequestId: `VERIFY-SESSION-${suffix}`, name: '自动验证', expectedCode: 'MAT-VERIFY-CODE',
      expectedQty: 2, purpose: 'GENERAL_COUNT', referenceType: 'GENERAL', scannerModel: honeywell1900Profile.model,
    })
    const session = await createScanSession(sessionInput, '验证员')
    assert.equal(session.expectedCode, 'VERIFY-CODE')
    assert.equal((await createScanSession(sessionInput, '重复请求')).id, session.id, '会话创建必须幂等')
    await recordScanEvent(session.id, recordScanEventSchema.parse({ clientEventId: `EVENT-1-${suffix}`, rawValue: 'VERIFY-CODE', quantity: 1 }), auditContext)
    const second = await recordScanEvent(session.id, recordScanEventSchema.parse({ clientEventId: `EVENT-2-${suffix}`, rawValue: 'VERIFY-CODE', quantity: 1 }), auditContext)
    assert.equal(second.data.countedQty, 2)
    assert.equal((await recordScanEvent(session.id, recordScanEventSchema.parse({ clientEventId: `EVENT-2-${suffix}`, rawValue: 'VERIFY-CODE', quantity: 1 }), auditContext)).data.countedQty, 2, '扫码事件必须幂等')
    const undone = await undoLastMatchedScan(session.id, auditContext)
    assert.equal(undone.countedQty, 1)
    await assert.rejects(() => completeScanSession(session.id, auditContext), ScanPrintServiceError)
    await recordScanEvent(session.id, recordScanEventSchema.parse({ clientEventId: `EVENT-3-${suffix}`, rawValue: 'VERIFY-CODE', quantity: 1 }), auditContext)
    assert.equal((await completeScanSession(session.id, auditContext)).data.status, 'COMPLETED')
    assert.equal((await listScanSessions({ purpose: 'GENERAL_COUNT' })).length, 1)

    const auditLogs = await prisma.auditLog.findMany({
      where: { operatorId: auditContext.operatorId },
      orderBy: { createdAt: 'asc' },
    })
    assert.deepEqual(
      auditLogs.map((log) => `${log.entityType}:${log.action}`),
      [
        'SCAN_COUNT_EVENT:CREATE', 'SCAN_COUNT_EVENT:CREATE', 'SCAN_COUNT_EVENT:REVERSE',
        'SCAN_COUNT_EVENT:CREATE', 'SCAN_COUNT_SESSION:COMPLETE',
      ],
    )
    assert.equal(auditLogs.every((log) => Boolean(log.afterData)), true, '扫码事件、撤销和完成审计必须保留结果快照')

    const jobInput = createLabelPrintJobSchema.parse({
      clientRequestId: `VERIFY-PRINT-${suffix}`, templateType: 'GENERIC_LABEL', referenceType: 'GENERAL',
      referenceId: 'VERIFY-CODE', copies: 1, labelWidthMm: 105, labelHeightMm: 70, payload: { code: 'VERIFY-CODE' },
    })
    const job = await createLabelPrintJob(jobInput, '验证员')
    assert.equal(job.printerDpi, 203)
    assert.equal((await createLabelPrintJob(jobInput, '重复请求')).id, job.id, '打印任务创建必须幂等')

    const documentJob = await createLabelPrintJob(createLabelPrintJobSchema.parse({
      clientRequestId: `VERIFY-DOCUMENT-PRINT-${suffix}`,
      templateType: 'DOCUMENT_QR',
      referenceType: 'PACKAGE_DOCUMENT',
      referenceId: 'BX-VERIFY-CODE',
      copies: 1,
      labelWidthMm: 105,
      labelHeightMm: 70,
      payload: { code: 'BX-VERIFY-CODE' },
    }), '验证员')
    assert.equal(documentJob.templateType, 'DOCUMENT_QR')

    console.log('扫码与标签打印模块验证通过：纯规则、幂等会话/事件/任务、撤销和完成状态均通过临时数据库回归。')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
