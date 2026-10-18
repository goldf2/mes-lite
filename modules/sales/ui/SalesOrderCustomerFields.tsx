'use client'

import FormField, { appInputClassName } from '@/app/components/FormField'
import SearchableSelect from '@/app/components/SearchableSelect'
import { CustomerMasterSelectionFields } from '@/modules/configuration'
import type { SalesCustomerOption, SalesOrderDraft } from '../contracts/sales-order'

export default function SalesOrderCustomerFields({ form, customers, onChange, onValidityChange, refreshKey, disabled }: {
  form: SalesOrderDraft
  customers: SalesCustomerOption[]
  onChange: (changes: Partial<SalesOrderDraft>) => void
  onValidityChange: (ready: boolean) => void
  refreshKey: number
  disabled: boolean
}) {
  return <>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <FormField label="客户" className="lg:col-span-2">
        <SearchableSelect
          value={form.customerId}
          disabled={disabled}
          onChange={customerId => { onValidityChange(false); onChange({ customerId }) }}
          options={customers.map(customer => ({ value: customer.id, label: customer.name, keywords: `${customer.code} ${customer.contact || ''} ${customer.phone || ''}` }))}
          placeholder="输入客户编码或名称筛选"
        />
      </FormField>
      <FormField label="订单日期"><input type="date" className={appInputClassName} disabled={disabled} value={form.orderDate} onChange={event => onChange({ orderDate: event.target.value })} /></FormField>
      <FormField label="计划交付"><input type="date" className={appInputClassName} disabled={disabled} value={form.deliveryDate} onChange={event => onChange({ deliveryDate: event.target.value })} /></FormField>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="客户订单号/凭据号"><input className={appInputClassName} disabled={disabled} value={form.voucherNo} onChange={event => onChange({ voucherNo: event.target.value })} /></FormField>
      <FormField label="备注"><input className={appInputClassName} disabled={disabled} value={form.note} onChange={event => onChange({ note: event.target.value })} /></FormField>
    </div>
    <CustomerMasterSelectionFields customerId={form.customerId} value={form} onChange={onChange} onValidityChange={onValidityChange} refreshKey={refreshKey} disabled={disabled} />
  </>
}
