'use client'

import { useEffect, useMemo, useState } from 'react'
import FormField, { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import type { ConfiguredUnit, CustomerOption, Material, MeasureType } from '../contracts'
import { MaterialApiError, saveMaterial, type MaterialUpsertInput } from '../client'
import { materialCategoryOptions, primaryMeasureOptions } from '../model/material-options'

interface MaterialFormState {
  code: string
  name: string
  spec: string
  note: string
  category: string
  customerId: string
  primaryMeasure: MeasureType
  referenceMeasure: MeasureType
  stockUnit: string
  useDualUnit: boolean
  valuationUnit: string
  conversionRate: number
  conversionNote: string
  costingMethod: string
  defaultSalePrice: string
  salesCurrency: string
}

function createMaterialForm(material: Material | null): MaterialFormState {
  if (!material) {
    return {
      code: '',
      name: '',
      spec: '',
      note: '',
      category: 'RAW',
      customerId: '',
      primaryMeasure: 'QUANTITY',
      referenceMeasure: 'WEIGHT',
      stockUnit: '件',
      useDualUnit: false,
      valuationUnit: '',
      conversionRate: 1,
      conversionNote: '',
      costingMethod: 'WEIGHTED_AVERAGE',
      defaultSalePrice: '',
      salesCurrency: 'CNY',
    }
  }

  const stockUnit = material.stockUnit || material.unit
  const valuationUnit = material.valuationUnit || material.unit
  const useDualUnit = valuationUnit !== stockUnit || Number(material.conversionRate || 1) !== 1

  return {
    code: material.code,
    name: material.name,
    spec: material.spec,
    note: material.note || '',
    category: material.category || 'RAW',
    customerId: material.customerId || '',
    primaryMeasure: material.primaryMeasure || 'QUANTITY',
    referenceMeasure: material.referenceMeasure || 'WEIGHT',
    stockUnit,
    useDualUnit,
    valuationUnit: useDualUnit ? valuationUnit : '',
    conversionRate: material.conversionRate || 1,
    conversionNote: material.conversionNote || '',
    costingMethod: material.costingMethod || 'WEIGHTED_AVERAGE',
    defaultSalePrice: material.defaultSalePrice == null ? '' : String(material.defaultSalePrice),
    salesCurrency: material.salesCurrency || 'CNY',
  }
}

export default function MaterialEditDialog({
  open,
  material,
  customers,
  unitCatalog,
  onClose,
  onMessage,
  onSaved,
}: {
  open: boolean
  material: Material | null
  customers: CustomerOption[]
  unitCatalog: ConfiguredUnit[]
  onClose: () => void
  onMessage: (message: string) => void
  onSaved: () => Promise<void> | void
}) {
  const [form, setForm] = useState<MaterialFormState>(() => createMaterialForm(material))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(createMaterialForm(material))
    setSaving(false)
  }, [material, open])

  const stockUnitOptions = useMemo(
    () => unitCatalog.filter((unit) => unit.measureType === form.primaryMeasure),
    [form.primaryMeasure, unitCatalog],
  )
  const valuationUnitOptions = useMemo(
    () => unitCatalog.filter((unit) => unit.measureType === form.referenceMeasure),
    [form.referenceMeasure, unitCatalog],
  )
  const stockUnitConfigured = stockUnitOptions.some((unit) => unit.code === form.stockUnit)
  const valuationUnitConfigured = valuationUnitOptions.some((unit) => unit.code === form.valuationUnit)

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.stockUnit || (form.useDualUnit && (!form.valuationUnit || form.conversionRate <= 0))) {
      onMessage('请填写完整信息')
      return
    }

    const payload: MaterialUpsertInput = {
      code: form.code,
      name: form.name,
      spec: form.spec,
      note: form.note,
      category: form.category,
      customerId: form.customerId || undefined,
      primaryMeasure: form.primaryMeasure,
      referenceMeasure: form.useDualUnit ? form.referenceMeasure : undefined,
      unit: form.stockUnit,
      stockUnit: form.stockUnit,
      valuationUnit: form.useDualUnit ? form.valuationUnit : form.stockUnit,
      conversionRate: form.useDualUnit ? form.conversionRate : 1,
      conversionNote: form.conversionNote || undefined,
      costingMethod: form.costingMethod,
      defaultSalePrice: form.defaultSalePrice === '' ? null : Number(form.defaultSalePrice),
      salesCurrency: form.salesCurrency,
    }

    setSaving(true)
    try {
      await saveMaterial(payload, material?.id)
      onMessage(material ? '物料更新成功' : '物料创建成功')
      await onSaved()
      onClose()
    } catch (error) {
      onMessage(error instanceof MaterialApiError ? error.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <ModalDialog
      title={material ? '编辑物料' : '新建物料'}
      description="维护物料基础资料、库存主单位和参考计价单位。"
      onClose={onClose}
      closeDisabled={saving}
      size="wide"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={handleSubmit}
          confirmLabel="保存"
          busy={saving}
        />
      )}
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <h4 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">基础信息</h4>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="物料编码" required>
              <input
                type="text"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                className={appInputClassName}
                placeholder="如：MAT-001"
              />
            </FormField>
            <FormField label="物料名称" required>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={appInputClassName}
                placeholder="如：GCr15 轴承钢"
              />
            </FormField>
            <FormField label="规格">
              <input
                type="text"
                value={form.spec}
                onChange={(event) => setForm({ ...form, spec: event.target.value })}
                className={appInputClassName}
                placeholder="如：Φ30mm 圆钢"
              />
            </FormField>
            <FormField label="备注" className="md:col-span-2 xl:col-span-3">
              <textarea
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                className={`${appTextareaClassName} min-h-20 resize-y`}
                placeholder="可记录客户零件号说明、图纸版本、特殊检验要求等"
              />
            </FormField>
            <FormField label="物料分类">
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className={appSelectClassName}
              >
                {materialCategoryOptions.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="归属客户">
              <SearchableSelect
                value={form.customerId}
                onChange={(customerId) => setForm({ ...form, customerId })}
                options={[
                  { value: '', label: '通用/未绑定客户' },
                  ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` })),
                ]}
                placeholder="输入客户编码或名称筛选"
              />
            </FormField>
            <FormField label="成本核算方法">
              <select
                value={form.costingMethod}
                onChange={(event) => setForm({ ...form, costingMethod: event.target.value })}
                className={appSelectClassName}
              >
                <option value="WEIGHTED_AVERAGE">移动加权平均</option>
                <option value="FIFO">先入先出 FIFO</option>
              </select>
            </FormField>
            <FormField label="默认销售价" hint="新建销售订单时自动带入；订单保存后使用价格快照。">
              <div className="flex rounded-lg border border-gray-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
                <span className="flex items-center border-r border-gray-200 px-3 text-sm text-gray-500">¥</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.defaultSalePrice}
                  onChange={(event) => setForm({ ...form, defaultSalePrice: event.target.value })}
                  className="min-w-0 flex-1 rounded-r-lg px-3 py-2 outline-none"
                  placeholder="未设置"
                />
              </div>
            </FormField>
            <FormField label="销售币种">
              <select
                value={form.salesCurrency}
                onChange={(event) => setForm({ ...form, salesCurrency: event.target.value })}
                className={appSelectClassName}
              >
                <option value="CNY">人民币（CNY）</option>
              </select>
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">单位与换算</h4>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="主计量方式" required hint="库存、领料和生产耗用均按主计量方式记账。">
              <select
                value={form.primaryMeasure}
                onChange={(event) => {
                  const primaryMeasure = event.target.value as MeasureType
                  const defaultUnit = unitCatalog.find((unit) => unit.measureType === primaryMeasure && unit.isBase)?.code
                    || (primaryMeasure === 'LENGTH' ? 'm' : primaryMeasure === 'WEIGHT' ? 'kg' : primaryMeasure === 'QUANTITY' ? '件' : '项')
                  setForm({ ...form, primaryMeasure, stockUnit: defaultUnit })
                }}
                className={appSelectClassName}
              >
                {primaryMeasureOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
            <div>
              <FormField label="主库存单位" required hint="只能选择系统单位目录中的单位；新增单位请到“配置 → 单位配置”。">
                <SearchableSelect
                  value={form.stockUnit}
                  onChange={(stockUnit) => setForm({ ...form, stockUnit })}
                  options={[
                    ...(!stockUnitConfigured && form.stockUnit ? [{ value: form.stockUnit, label: `旧单位：${form.stockUnit}（待配置）` }] : []),
                    ...stockUnitOptions.map((unit) => ({
                      value: unit.code,
                      label: `${unit.name}（${unit.code}） · 1 ${unit.code} = ${unit.toBaseFactor} ${stockUnitOptions.find((item) => item.isBase)?.code || '基准单位'}`,
                    })),
                  ]}
                  placeholder="输入单位名称或编码筛选"
                />
              </FormField>
              {material && (material.stockUnit || material.unit) !== form.stockUnit && (
                <p className="mt-1 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  将从 {material.stockUnit || material.unit} 改为 {form.stockUnit || '空'}。系统只修改物料主数据并记录审计，不换算数值，也不改写历史业务记录和既有 BOM。
                </p>
              )}
            </div>
            <label className="flex min-h-[42px] items-center gap-2 self-end rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.useDualUnit}
                onChange={(event) => setForm({
                  ...form,
                  useDualUnit: event.target.checked,
                  valuationUnit: event.target.checked
                    ? form.valuationUnit || unitCatalog.find((unit) => unit.measureType === form.referenceMeasure && unit.isBase)?.code || ''
                    : '',
                  conversionRate: event.target.checked ? form.conversionRate : 1,
                  conversionNote: event.target.checked ? form.conversionNote : '',
                })}
                className="h-4 w-4"
              />
              记录参考/计价单位
            </label>
          </div>

          {form.useDualUnit && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField label="参考计量方式" required>
                <select
                  value={form.referenceMeasure}
                  onChange={(event) => {
                    const referenceMeasure = event.target.value as MeasureType
                    const valuationUnit = unitCatalog.find((unit) => unit.measureType === referenceMeasure && unit.isBase)?.code || ''
                    setForm({ ...form, referenceMeasure, valuationUnit })
                  }}
                  className={appSelectClassName}
                >
                  {primaryMeasureOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              <FormField label="参考/计价单位" required>
                <SearchableSelect
                  value={form.valuationUnit}
                  onChange={(valuationUnit) => setForm({ ...form, valuationUnit })}
                  options={[
                    ...(!valuationUnitConfigured && form.valuationUnit ? [{ value: form.valuationUnit, label: `旧单位：${form.valuationUnit}（待配置）` }] : []),
                    ...valuationUnitOptions.map((unit) => ({ value: unit.code, label: `${unit.name}（${unit.code}）` })),
                  ]}
                  placeholder="输入单位名称或编码筛选"
                />
              </FormField>
              <FormField label="默认参考换算" required hint={`仅在来料未填实测值时参考：1 ${form.stockUnit || '主单位'} = ${form.conversionRate || 0} ${form.valuationUnit || '参考单位'}`}>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.conversionRate || ''}
                  onChange={(event) => setForm({ ...form, conversionRate: Number(event.target.value) })}
                  className={appInputClassName}
                  placeholder="例如：2.35"
                />
              </FormField>
              <FormField label="换算说明">
                <input
                  type="text"
                  value={form.conversionNote}
                  onChange={(event) => setForm({ ...form, conversionNote: event.target.value })}
                  className={appInputClassName}
                  placeholder="如：仅作缺少实测时的参考，来料实际值优先"
                />
              </FormField>
            </div>
          )}
          <p className="text-xs text-gray-500">物料不保存标准长度。长度型原料在每张来料单按根数及总长度/单根长度录入本批实际长度。</p>
        </section>
      </div>
    </ModalDialog>
  )
}
