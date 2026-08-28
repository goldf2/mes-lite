import assert from 'node:assert/strict'
import { parseCsv } from '../lib/csv'
import {
  buildDataIntegrityFaultCsv,
  dataIntegrityFaultFilename,
} from '../modules/operations-tools/domain/data-integrity-export'

const csv = buildDataIntegrityFaultCsv({
  checkedAt: '2026-08-29T01:02:03.000Z',
  issues: [{
    id: 'BOM_UNIT_MISMATCH:item-1',
    type: 'BOM_UNIT_MISMATCH',
    severity: 'BLOCKING',
    title: 'BOM 原料单位与当前主单位不一致',
    detail: '包含逗号, 引号"与\n换行的完整说明',
    entityType: 'BOMItem',
    entityId: '=FORMULA-RISK',
    entityLabel: 'MAT-001 · 铝型材',
    currentValue: 'm',
    expectedValue: 'kg',
    actions: [{ key: 'SYNC_BOM_ITEM_UNIT', label: '按当前主单位修复' }],
  }],
})

assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV 必须包含 UTF-8 BOM，避免 Excel 打开中文乱码')
const rows = parseCsv(csv.slice(1))
assert.equal(rows.length, 2, '应输出表头和一条故障明细')
assert.deepEqual(rows[0], [
  '序号', '检查时间', '严重程度', '故障ID', '故障类型', '问题标题', '对象类型',
  '对象ID', '对象说明', '当前值', '期望值', '可执行操作', '详细说明',
])
assert.equal(rows[1][2], '阻塞')
assert.equal(rows[1][3], 'BOM_UNIT_MISMATCH:item-1')
assert.equal(rows[1][4], 'BOM_UNIT_MISMATCH')
assert.equal(rows[1][7], "'=FORMULA-RISK", '可能触发电子表格公式的文本必须转义')
assert.equal(rows[1][11], '按当前主单位修复 (SYNC_BOM_ITEM_UNIT)')
assert.equal(rows[1][12], '包含逗号, 引号"与\n换行的完整说明')
assert.match(
  dataIntegrityFaultFilename('2026-08-29T01:02:03.000Z'),
  /^MES-lite-数据故障明细-20260829-\d{6}\.csv$/,
)

console.log('数据故障明细导出验证通过：字段完整、中文 BOM、CSV 转义和文件名均符合要求。')
