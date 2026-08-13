import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flattenArchivedRecords } from '../modules/operations-tools/model/archive-records'

const sourceRoot = process.cwd()
const requiredFiles = [
  'modules/operations-tools/client/maintenance-api.ts',
  'modules/operations-tools/contracts/maintenance.ts',
  'modules/operations-tools/domain/archive-resource-policy.ts',
  'modules/operations-tools/model/archive-records.ts',
  'modules/operations-tools/server/archive-data-scope-service.ts',
  'modules/operations-tools/server/archived-record-purge-service.ts',
  'modules/operations-tools/server/archived-record-restore-service.ts',
  'modules/operations-tools/server/data-integrity-service.ts',
  'modules/operations-tools/server/material-code-normalization-service.ts',
  'modules/operations-tools/server/maintenance-query-service.ts',
  'modules/operations-tools/ui/ArchiveRecordsPage.tsx',
  'modules/operations-tools/ui/AuditLogPage.tsx',
  'modules/operations-tools/ui/DataToolsPage.tsx',
]

for (const path of requiredFiles) {
  assert.ok(existsSync(join(sourceRoot, path)), `运维维护工具缺少模块文件：${path}`)
}

const clientSource = readFileSync(join(sourceRoot, 'modules/operations-tools/client/maintenance-api.ts'), 'utf8')
for (const path of requiredFiles.filter((path) => path.includes('/ui/'))) {
  assert.doesNotMatch(readFileSync(join(sourceRoot, path), 'utf8'), /\bfetch\(/, `${path} 不得直接调用 fetch`)
}
assert.match(clientSource, /\/api\/deleted-records/, '维护 client 必须集中归档接口')
assert.match(clientSource, /\/api\/audit-logs/, '维护 client 必须集中审计接口')
assert.match(clientSource, /\/api\/system\/material-code-normalization/, '维护 client 必须集中编码规范化接口')

for (const path of [
  'app/api/deleted-records/route.ts',
  'app/api/restore/route.ts',
  'app/api/audit-logs/route.ts',
  'app/api/system/data-integrity/route.ts',
  'app/api/system/material-code-normalization/route.ts',
]) {
  const source = readFileSync(join(sourceRoot, path), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/prisma|\bprisma\.|\$transaction|SOFT_DELETE_MODELS/, `${path} 不得承载数据库、事务或模型委托`)
  assert.ok(source.split('\n').length <= 60, `${path} 必须保持为不超过 60 行的 HTTP 适配层`)
}
for (const path of ['lib/archived-record-purge.ts', 'lib/data-integrity.ts', 'lib/material-code-normalization.ts', 'lib/soft-delete.ts']) {
  assert.equal(existsSync(join(sourceRoot, path)), false, `${path} 不得在扁平 lib 重新拥有运维领域规则`)
}

const records = flattenArchivedRecords({
  materials: [{ id: 'material-1', code: 'MAT-001', deletedAt: '2026-08-08T08:00:00.000Z' }],
  workInstructions: [{
    id: 'document-1',
    material: { code: 'MAT-002', name: '主动轴' },
    deletedAt: '2026-08-09T08:00:00.000Z',
  }],
  shipments: [{ id: 'shipment-1', shipmentNo: 'SH-001', deletedAt: '2026-08-07T08:00:00.000Z' }],
})

assert.equal(records.length, 3)
assert.equal(records[0].model, 'workInstruction', '归档记录必须按最新归档时间排序')
assert.equal(records[0].label, 'MAT-002 · 主动轴', '文档归档标签必须使用物料编码和名称')
assert.equal(records[1].label, 'MAT-001')
assert.equal(records[2].label, 'SH-001')

console.log('运维维护工具模块验证通过：3 个页面零直接请求，归档映射与排序规则符合预期。')
