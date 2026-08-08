import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { csvResponse, toCsv } from '@/lib/csv'

export const dynamic = 'force-dynamic'

const rows = [
  ['物料编码', '物料名称', '规格', '备注', '分类', '归属客户', '主计量方式', '库存单位', '启用双单位', '参考计量方式', '核算单位', '换算系数', '成本方法', '默认销售价', '销售币种', '换算说明'],
  ['CUST-AL-001', '左侧铝型材支架', '6063-T5 / 20x40', '客户零件号可作为物料编码', 'FINISHED', '', '数量', '件', '否', '', '', '', 'WEIGHTED_AVERAGE', '128.00', 'CNY', ''],
  ['AL-RAW-001', '铝型材原料', '6063-T5 / 20x40', '物料不记录标准长度；每批填写实际总长度和总重量', 'RAW', '', '长度', 'm', '是', '重量', 'kg', '1', 'FIFO', '', 'CNY', '换算仅为缺少实测时的参考；来料实测值优先'],
]

export async function GET() {
  try {
    const denied = await requireResourcePermission('materials', 'read')
    if (denied) return denied

    return csvResponse('material-import-template.csv', toCsv(rows))
  } catch (error) {
    console.error('Download material import template error:', error)
    return NextResponse.json({ error: '下载物料导入模板失败' }, { status: 500 })
  }
}
