'use client'

import { appInputClassName, appSelectClassName } from '@/app/components/FormField'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'
import { parseFieldOptions } from '../domain/document-field-rules'

export default function DocumentExtensionFields({
  definitions,
  values,
  onChange,
  compact = false,
}: {
  definitions: DocumentFieldDefinitionRecord[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  compact?: boolean
}) {
  if (definitions.length === 0) return null
  const update = (id: string, value: string) => onChange({ ...values, [id]: value })

  return (
    <section className={compact ? 'md:col-span-2 xl:col-span-4' : 'md:col-span-2 xl:col-span-3'}>
      <div className={`${compact ? 'mb-2 text-xs' : 'mb-3 text-sm'} font-semibold text-gray-700`}>分类扩展字段</div>
      <div className={`grid grid-cols-1 ${compact ? 'gap-3 md:grid-cols-2 xl:grid-cols-4' : 'gap-4 md:grid-cols-2 xl:grid-cols-3'}`}>
        {definitions.map((definition) => {
          const value = values[definition.id] || ''
          return (
            <label key={definition.id} className="block min-w-0">
              <span className={`${compact ? 'mb-1 text-xs' : 'mb-2 text-sm'} block font-medium text-gray-700`}>{definition.name}</span>
              {definition.fieldType === 'SELECT' ? (
                <select value={value} onChange={(event) => update(definition.id, event.target.value)} className={appSelectClassName}>
                  <option value="">未填写</option>
                  {parseFieldOptions(definition.optionsJson).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : definition.fieldType === 'BOOLEAN' ? (
                <select value={value} onChange={(event) => update(definition.id, event.target.value)} className={appSelectClassName}>
                  <option value="">未填写</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              ) : (
                <input
                  type={definition.fieldType === 'NUMBER' ? 'number' : definition.fieldType === 'DATE' ? 'date' : 'text'}
                  value={value}
                  onChange={(event) => update(definition.id, event.target.value)}
                  className={appInputClassName}
                  maxLength={definition.fieldType === 'TEXT' ? 2000 : undefined}
                />
              )}
            </label>
          )
        })}
      </div>
    </section>
  )
}
