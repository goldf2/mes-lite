'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import { OneToManyRelationField } from '@/app/components/relations'
import type { Material } from '../contracts'
import { materialEngineeringTextFields, materialPurposeOptions } from '../contracts/material-extension'
import {
  materialDimensionRows,
  materialEngineeringTextLabels,
  materialKindLabels,
  materialSourceModeLabels,
  type MaterialEngineeringField,
  type MaterialEngineeringForm,
  type MaterialModelUsageForm,
} from '../model/material-engineering-form'

export default function MaterialEngineeringFields({ form, stockUnit, onChange }: {
  form: MaterialEngineeringForm
  stockUnit: string
  onChange: (form: MaterialEngineeringForm) => void
}) {
  const [modelCode, setModelCode] = useState('')
  const setField = (field: MaterialEngineeringField, value: string) => onChange({
    ...form,
    values: { ...form.values, [field]: value },
    dirty: { ...form.dirty, [field]: true },
  })
  const setUsages = (modelUsages: MaterialModelUsageForm[]) => onChange({
    ...form,
    modelUsages,
    dirty: { ...form.dirty, modelUsages: true },
  })
  const updateUsage = (clientKey: string, patch: Partial<MaterialModelUsageForm>) => setUsages(
    form.modelUsages.map((usage) => usage.clientKey === clientKey ? { ...usage, ...patch } : usage),
  )
  const addUsage = () => {
    if (!modelCode.trim()) return
    setUsages([...form.modelUsages, {
      clientKey: `new-${crypto.randomUUID()}`,
      modelCode: modelCode.trim(),
      assemblyName: '',
      quantityPerMachine: '',
    }])
    setModelCode('')
  }

  return (
    <>
      <section className="space-y-3">
        <h4 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">物料属性与用途</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="物料性质">
            <select value={form.values.materialKind} onChange={(event) => setField('materialKind', event.target.value)} className={appSelectClassName}>
              {!form.values.materialKind && <option value="" disabled>未设置</option>}
              {Object.entries(materialKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
          <FormField label="默认供给方式" hint="用于资料参考，具体业务按单据确定。">
            <select value={form.values.defaultSourceMode} onChange={(event) => setField('defaultSourceMode', event.target.value)} className={appSelectClassName}>
              <option value="">未设置</option>
              {Object.entries(materialSourceModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-gray-700">物料用途</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 py-1">
            {materialPurposeOptions.map((option) => (
              <label key={option.value} className="flex min-h-10 items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="h-4 w-4" checked={form.purposeCodes.includes(option.value)} onChange={(event) => onChange({
                  ...form,
                  purposeCodes: event.target.checked ? [...form.purposeCodes, option.value] : form.purposeCodes.filter((code) => code !== option.value),
                  dirty: { ...form.dirty, purposeCodes: true },
                })} />
                {option.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">可多选，同一物料可以用于多个业务。</p>
        </fieldset>
      </section>

      <details className="rounded-lg border border-gray-200" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">工程资料（可后补）</summary>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 border-t border-gray-100 p-4 md:grid-cols-2 xl:grid-cols-3">
          {materialEngineeringTextFields.map((field) => (
            <FormField key={field} label={materialEngineeringTextLabels[field]} className={field === 'machiningProcess' ? 'md:col-span-2 xl:col-span-3' : ''} hint={field === 'grossWeightText' ? '可填写重量与单位。' : undefined}>
              {field === 'machiningProcess' || field === 'heatTreatmentProcess' ? (
                <textarea value={form.values[field]} onChange={(event) => setField(field, event.target.value)} rows={2} className={appTextareaClassName} />
              ) : (
                <input type="text" value={form.values[field]} onChange={(event) => setField(field, event.target.value)} className={appInputClassName} />
              )}
            </FormField>
          ))}
          {([
            ['heatTreatment', '热处理状态'],
            ['heatTreatmentConfirmed', '热处理已确认'],
          ] as const).map(([field, label]) => (
            <FormField key={field} label={label}>
              <select value={form.values[field]} onChange={(event) => setField(field, event.target.value)} className={appSelectClassName}>
                <option value="">未知</option>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </FormField>
          ))}
        </div>
      </details>

      <details className="rounded-lg border border-gray-200">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">净尺寸与毛坯尺寸（mm）</summary>
        <div className="space-y-3 border-t border-gray-100 p-4">
          <div className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 text-xs font-medium text-gray-500">
            <span>尺寸</span><span>净尺寸（mm）</span><span>毛坯尺寸（mm）</span>
          </div>
          {materialDimensionRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
              <span className="text-sm text-gray-700">{row.label}</span>
              {([row.finished, row.blank] as const).map((field, index) => (
                <input key={field} type="number" min={0} step="any" value={form.values[field]} aria-label={`${row.label}${index === 0 ? '净尺寸' : '毛坯尺寸'}（mm）`} onChange={(event) => setField(field, event.target.value)} className={appInputClassName} placeholder="未填写" />
              ))}
            </div>
          ))}
          <p className="text-xs text-gray-500">留空表示未知，0 保留为录入值，需核实其是否表示不适用。</p>
        </div>
      </details>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <OneToManyRelationField
          title="适用机型与每台用量"
          items={form.modelUsages}
          getKey={(usage) => usage.clientKey}
          selector={(
            <div className="flex items-end gap-2">
              <FormField label="添加适用机型" className="min-w-0 flex-1">
                <input type="text" value={modelCode} onChange={(event) => setModelCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addUsage() } }} placeholder="输入机型代码，如 10B-3S" className={appInputClassName} />
              </FormField>
              <AppButton onClick={addUsage} disabled={!modelCode.trim()}>添加</AppButton>
            </div>
          )}
          emptyText="尚未填写适用机型，可在需要时补充。"
          onRemove={(usage) => setUsages(form.modelUsages.filter((item) => item.clientKey !== usage.clientKey))}
          renderIdentity={(usage) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="机型代码">
                <input type="text" value={usage.modelCode} onChange={(event) => updateUsage(usage.clientKey, { modelCode: event.target.value })} className={appInputClassName} />
              </FormField>
              <FormField label="部件分组">
                <input type="text" value={usage.assemblyName} onChange={(event) => updateUsage(usage.clientKey, { assemblyName: event.target.value })} className={appInputClassName} placeholder="可留空，如送料" />
              </FormField>
            </div>
          )}
          renderFields={(usage) => (
            <FormField label={`每台数量（${stockUnit || '库存单位'}）`}>
              <input type="number" min={0} step="any" value={usage.quantityPerMachine} onChange={(event) => updateUsage(usage.clientKey, { quantityPerMachine: event.target.value })} className={appInputClassName} placeholder="未知" />
              {(usage.quantityPerMachine === '' || Number(usage.quantityPerMachine) === 0) && <span className="mt-1 block text-xs text-amber-700">{usage.quantityPerMachine === '' ? '用量未知，待补充' : '用量为 0，待核对'}</span>}
            </FormField>
          )}
        />
        <p className="px-4 pb-4 text-xs text-gray-500">记录适用范围和每台用量，保存时随物料资料一起提交。</p>
      </div>
    </>
  )
}

export function MaterialEngineeringDetails({ material }: { material: Material }) {
  const purposes = materialPurposeOptions.filter((option) => material.purposeCodes?.includes(option.value)).map((option) => option.label)
  return (
    <section className="space-y-5 border-t border-gray-200 pt-5">
      <h3 className="text-base font-semibold text-gray-900">物料属性与工程资料</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        {([
          ['物料性质', material.materialKind ? materialKindLabels[material.materialKind] || material.materialKind : null],
          ['默认供给方式', material.defaultSourceMode ? materialSourceModeLabels[material.defaultSourceMode] || material.defaultSourceMode : null],
          ['用途', purposes.join('、') || null],
          ...materialEngineeringTextFields.map((field) => [materialEngineeringTextLabels[field], material[field]]),
          ['热处理状态', material.heatTreatment == null ? '未知' : material.heatTreatment ? '是' : '否'],
          ['热处理已确认', material.heatTreatmentConfirmed == null ? '未知' : material.heatTreatmentConfirmed ? '是' : '否'],
        ] as const).map(([label, value]) => (
          <div key={label} className="min-w-0"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{value ?? '未填写'}</dd></div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="pb-2 text-left font-medium text-gray-800">设计尺寸（mm）</caption>
          <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th scope="col" className="px-3 py-2">尺寸</th><th scope="col" className="px-3 py-2">净尺寸</th><th scope="col" className="px-3 py-2">毛坯尺寸</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{materialDimensionRows.map((row) => <tr key={row.label}><th scope="row" className="px-3 py-2 text-left font-normal">{row.label}</th><td className="px-3 py-2">{material[row.finished] ?? '未填写'}</td><td className="px-3 py-2">{material[row.blank] ?? '未填写'}</td></tr>)}</tbody>
        </table>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-800">适用机型与每台用量</h4>
        {!material.modelUsages?.length ? <p className="text-sm text-gray-500">未填写</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th scope="col" className="px-3 py-2">机型</th><th scope="col" className="px-3 py-2">部件分组</th><th scope="col" className="px-3 py-2">每台数量（{material.stockUnit || material.unit}）</th></tr></thead><tbody className="divide-y divide-gray-100">{material.modelUsages.map((usage, index) => <tr key={`${usage.modelCode}-${usage.assemblyName || ''}-${index}`}><td className="px-3 py-2 font-mono">{usage.modelCode}</td><td className="px-3 py-2">{usage.assemblyName || '未分组'}</td><td className="px-3 py-2">{usage.quantityPerMachine == null ? '未知，待补充' : usage.quantityPerMachine === 0 ? '0（待核对）' : usage.quantityPerMachine}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </section>
  )
}
