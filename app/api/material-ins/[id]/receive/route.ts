import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { postInventoryReceipt } from '@/lib/inventory'

// PATCH: 确认收货入库
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied

    const { id } = params

    const materialIn = await prisma.materialIn.findUnique({
      where: { id },
      include: { material: true },
    })

    if (!materialIn) {
      return NextResponse.json({ error: '来料单不存在' }, { status: 404 })
    }

    if (materialIn.material.deletedAt) {
      return NextResponse.json({ error: '物料已归档，无法确认收货' }, { status: 400 })
    }

    if (materialIn.status !== 'PENDING') {
      return NextResponse.json({ error: '来料单状态不是待收货，无法确认收货' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      await postInventoryReceipt(tx, {
        materialId: materialIn.materialId,
        stockQty: Number(materialIn.qty),
        valuationQty: Number(materialIn.valuationQty),
        conversionSource: materialIn.conversionSource === 'DOCUMENT_ACTUAL' ? 'DOCUMENT_ACTUAL' : 'MASTER_DEFAULT',
        costAmount: Number(materialIn.totalAmount),
        type: 'IN',
        refType: 'MATERIAL_IN',
        refId: id,
        note: `来料入库: ${materialIn.inboundNo}`,
        idempotencyKey: `MATERIAL_IN:${id}:RECEIVE`,
        materialInId: id,
      })
      return tx.materialIn.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          inboundDate: new Date(),
        },
      })
    })

    await writeAuditLog(_req, {
      action: 'RECEIVE',
      entityType: 'MATERIAL_IN',
      entityId: result.id,
      entityLabel: result.inboundNo,
      beforeData: materialIn,
      afterData: result,
    })

    return NextResponse.json({ success: true, message: '收货成功' })
  } catch (error) {
    console.error('Receive material-in error:', error)
    return NextResponse.json({ error: '确认收货失败' }, { status: 500 })
  }
}
