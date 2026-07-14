import { NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { csvResponse, toCsv } from '@/lib/csv'

export const dynamic = 'force-dynamic'

const rows = [
  ['物料编码', '物料名称', '规格', '分类', '客户编码', '库存单位', '启用双单位', '核算单位', '换算系数', '成本方法', '换算说明'],
  ['CUST-AL-001', '左侧铝型材支架', '6063-T5 / 20x40 / L=120mm', 'FINISHED', 'CUST001', '件', '否', '', '', 'WEIGHTED_AVERAGE', ''],
  ['AL-RAW-001', '铝型材原料', '6063-T5 / 20x40 / 6m', 'RAW', '', '根', '是', 'kg', '2.35', 'FIFO', '按理论重量，可在来料单按实重修正'],
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
