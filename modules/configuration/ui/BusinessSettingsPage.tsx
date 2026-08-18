'use client'

import { useCallback, useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName } from '@/app/components/FormField'
import { ResourcePageShell } from '@/app/components/resource'
import {
  loadBusinessSettings,
  updateBusinessSettings,
  type BusinessSettingsView,
} from '../client/business-settings-api'

const emptyProfile: BusinessSettingsView = {
  naturalMaterialCodeSortEnabled: false,
  companyName: '',
  companyContact: '',
  companyPhone: '',
  companyAddress: '',
  businessDocumentPrintDensity: 'compact',
  businessDocumentPrintMarginMm: 10,
}

export default function BusinessSettingsPage({ onMessage, canUpdate }: { onMessage: (message: string) => void; canUpdate: boolean }) {
  const [settings, setSettings] = useState(emptyProfile)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSettings(await loadBusinessSettings())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取企业与业务规则失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    void load()
  }, [load])

  const saveCompanyProfile = async () => {
    if (!settings.companyName.trim()) return onMessage('请填写乙方企业名称')
    setSaving(true)
    try {
      setSettings(await updateBusinessSettings({
        companyName: settings.companyName,
        companyContact: settings.companyContact,
        companyPhone: settings.companyPhone,
        companyAddress: settings.companyAddress,
      }))
      onMessage('发货单乙方资料已保存')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存企业资料失败')
    } finally {
      setSaving(false)
    }
  }

  const saveNaturalCodeSort = async (enabled: boolean) => {
    setSaving(true)
    try {
      setSettings(await updateBusinessSettings({ naturalMaterialCodeSortEnabled: enabled }))
      onMessage(`物料编码数字自然排序已${enabled ? '开启' : '关闭'}`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存业务排序规则失败')
    } finally {
      setSaving(false)
    }
  }

  const savePrintSettings = async () => {
    setSaving(true)
    try {
      setSettings(await updateBusinessSettings({
        businessDocumentPrintDensity: settings.businessDocumentPrintDensity,
        businessDocumentPrintMarginMm: settings.businessDocumentPrintMarginMm,
      }))
      onMessage('业务单据打印格式已保存')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '保存打印格式失败')
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: keyof Pick<BusinessSettingsView, 'companyName' | 'companyContact' | 'companyPhone' | 'companyAddress'>, value: string) => {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  return (
    <ResourcePageShell
      resourceKey="businessSettings"
      title="企业与业务规则"
      description="维护企业资料以及会影响业务数据、列表和导出的全局规则。"
      contentClassName="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="mb-4">
          <div className="font-medium text-gray-900">发货单乙方资料</div>
          <div className="mt-1 text-sm text-gray-500">作为供货方显示在发货单 PDF 中；甲方资料自动读取销售订单客户。</div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="企业名称" required><input value={settings.companyName} onChange={(event) => updateField('companyName', event.target.value)} className={appInputClassName} disabled={loading || !canUpdate} /></FormField>
          <FormField label="联系人"><input value={settings.companyContact} onChange={(event) => updateField('companyContact', event.target.value)} className={appInputClassName} disabled={loading || !canUpdate} /></FormField>
          <FormField label="联系电话"><input value={settings.companyPhone} onChange={(event) => updateField('companyPhone', event.target.value)} className={appInputClassName} disabled={loading || !canUpdate} /></FormField>
          <FormField label="企业地址"><input value={settings.companyAddress} onChange={(event) => updateField('companyAddress', event.target.value)} className={appInputClassName} disabled={loading || !canUpdate} /></FormField>
        </div>
        {canUpdate && <div className="mt-4 flex justify-end"><AppButton variant="primary" onClick={saveCompanyProfile} disabled={loading || saving}>{saving ? '保存中...' : '保存乙方资料'}</AppButton></div>}
      </section>

      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="mb-4">
          <div className="font-medium text-gray-900">业务单据打印格式</div>
          <div className="mt-1 text-sm text-gray-500">固定使用 A4 纵向版式；紧凑模式会缩短明细行高，14 条来料明细可排在一页内。超出容量时仍会自动分页。</div>
          <div className="mt-2 text-xs text-gray-500">保存只保存业务数据；请在单据清单或详情中单独点击“打印”。旧归档会在下次打印时按新格式生成新版。</div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="排版密度">
            <select
              value={settings.businessDocumentPrintDensity}
              onChange={(event) => setSettings((current) => ({ ...current, businessDocumentPrintDensity: event.target.value as BusinessSettingsView['businessDocumentPrintDensity'] }))}
              className={appInputClassName}
              disabled={loading || !canUpdate}
            >
              <option value="compact">紧凑（推荐）</option>
              <option value="standard">标准</option>
            </select>
          </FormField>
          <FormField label="页面边距（毫米）" hint="可设置 8–20 mm；默认 10 mm。">
            <input
              type="number"
              min={8}
              max={20}
              step={1}
              value={settings.businessDocumentPrintMarginMm}
              onChange={(event) => setSettings((current) => ({ ...current, businessDocumentPrintMarginMm: Number(event.target.value) }))}
              className={appInputClassName}
              disabled={loading || !canUpdate}
            />
          </FormField>
        </div>
        {canUpdate && <div className="mt-4 flex justify-end"><AppButton variant="primary" onClick={savePrintSettings} disabled={loading || saving}>{saving ? '保存中...' : '保存打印格式'}</AppButton></div>}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-medium text-gray-900">物料编码数字自然排序</div>
            <div className="mt-1 text-sm text-gray-500">开启后，物料列表和导出中的编码按数字片段排序，例如 2 排在 12 前、A2 排在 A10 前；不会修改编码内容。</div>
            <div className="mt-2 text-xs text-gray-500">业务配置，保存后对所有客户端生效。</div>
          </div>
          <label className={`inline-flex items-center gap-3 ${loading || saving ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
            <span className="text-sm text-gray-600">{loading ? '读取中' : saving ? '保存中' : settings.naturalMaterialCodeSortEnabled ? '已开启' : '已关闭'}</span>
            <input type="checkbox" checked={settings.naturalMaterialCodeSortEnabled} disabled={loading || saving || !canUpdate} onChange={(event) => saveNaturalCodeSort(event.target.checked)} className="sr-only" />
            <span className={`relative h-7 w-12 rounded-full transition ${settings.naturalMaterialCodeSortEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${settings.naturalMaterialCodeSortEnabled ? 'left-6' : 'left-1'}`} /></span>
          </label>
        </div>
      </section>
    </ResourcePageShell>
  )
}
