import type { WarehousePackage, WarehousePackageLabelRevision, WarehousePackagingType } from '../contracts/warehouse-package'

export const warehousePackagingTypes: Array<{ value: WarehousePackagingType; label: string }> = [
  { value: 'CARTON', label: '纸箱' },
  { value: 'METAL_CAGE', label: '金属网箱' },
  { value: 'PLASTIC_BOX', label: '塑料周转盒' },
  { value: 'OTHER', label: '其他包装' },
]

export const warehousePackageStatusLabel: Record<string, string> = {
  PACKED: '可发货', AVAILABLE: '可发货', RESERVED: '待发占用', SHIPPED: '已发货', DELIVERED: '已签收', CANCELLED: '已作废', VOIDED: '已作废', ARCHIVED: '已归档', REVERSED: '已冲销',
}

export function warehousePackageLabelData(record: WarehousePackage): NonNullable<WarehousePackageLabelRevision['payload']> {
  const item = record.items[0]
  return {
    title: '货物装箱标签',
    code: record.packageNo,
    qrValue: record.labelRevision?.qrValue || record.packageNo,
    description: item ? `${item.material.code} · ${item.material.name}` : '未记录产品',
    details: [],
    layout: 'packing',
    fields: [
      { label: '装箱编号', value: record.packageNo },
      { label: '产品编码', value: item?.material.code || '未记录' },
      { label: '产品名称', value: item?.material.name || '未记录' },
      { label: '规格', value: item?.material.spec || '未记录' },
      { label: '数量', value: item ? `${item.quantity} ${item.unitSnapshot}` : '未记录' },
      { label: '生产批次', value: item?.lotNoSnapshot || '未记录' },
      { label: '生产人员', value: record.productionPersonnel.join('、') || '未记录' },
      { label: '质检人员', value: record.qualityPersonnel.join('、') || '未记录' },
      { label: '包装人员', value: record.packedBy || '未记录' },
      { label: '包装日期', value: new Date(record.packedAt).toLocaleString('zh-CN', { hour12: false }) },
      { label: '包装类型', value: warehousePackagingTypes.find((type) => type.value === record.packagingType)?.label || record.packagingType },
    ],
  }
}
