'use client'

import { useState } from 'react'
import { appSelectClassName } from '@/app/components/FormField'
import type { MaterialImportOptions, MaterialImportPreview } from '../contracts/material-import'
const actionLabels = { new: '新增', update: '更新', skip: '跳过', error: '错误' }

export default function MaterialImportReview({preview, options, previewCurrent, busy, mapColumn}: {
  preview: MaterialImportPreview
  options: MaterialImportOptions
  previewCurrent: boolean
  busy: boolean
  mapColumn: (column: number, target: string) => void
}) {
  const [onlyIssues, setOnlyIssues] = useState(false)
  const rows = preview.rows.filter(row => !onlyIssues || row.errors.length || row.warnings.length)
  return (
    <>
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">字段对应</h4>
            <p className="text-xs text-gray-500">核对自动建议；每个来源列和目标字段只能对应一次。留为“忽略”不会写入该列。已对应的空单元格按字段规则处理，更新前请检查预览。</p>
            <fieldset disabled={busy} className="max-h-80 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600"><tr><th className="p-3">来源列</th><th className="p-3">样本</th><th className="p-3">目标字段</th></tr></thead>
                <tbody>{preview.columns.map(column => {
                  const selected = Object.keys(options.mapping || {}).find(key => options.mapping?.[key] === column.index) || ''
                  const samples = (column as typeof column & { samples?: unknown[] }).samples || []
                  return <tr key={column.index} className="border-t border-gray-100">
                    <td className="p-3">{column.index + 1}. {column.name || '（空表头）'}</td>
                    <td className="max-w-52 truncate p-3 text-xs text-gray-500" title={samples.map(String).join(' / ')}>{samples.map(String).join(' / ') || '—'}</td>
                    <td className="p-2"><select aria-label={`${column.name || column.index + 1} 对应目标字段`} className={appSelectClassName} value={selected} onChange={event => mapColumn(column.index, event.target.value)}>
                      <option value="">忽略此列</option>
                      {preview.fields.map(field => <option key={field.key} value={field.key}
                        disabled={options.mapping?.[field.key] != null && options.mapping[field.key] !== column.index}>
                        {field.label}{field.required ? ' *' : ''}{field.hint ? ` · ${field.hint}` : ''}
                      </option>)}
                    </select></td>
                  </tr>
                })}</tbody>
              </table>
            </fieldset>
          </section>
          <section className="space-y-3" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{previewCurrent ? '导入预览' : '参数已变更，请重新预览'}</h4>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)} />只看问题行</label>
            </div>
            <p className="text-sm text-gray-700">共 {preview.summary.total} 行：新增 {preview.summary.new}，更新 {preview.summary.update}，跳过 {preview.summary.skip}，错误 {preview.summary.error}，提示 {preview.summary.warnings} 项。</p>
            {preview.warnings.length > 0 && <ul className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            {preview.summary.error > 0 && <p className="text-sm text-red-700">请修正文件或字段对应后重新预览，错误未解决时整批不写入。</p>}
            <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600"><tr><th className="p-3">文件行</th><th className="p-3">物料编码 / 名称</th><th className="p-3">动作</th><th className="p-3">检查结果</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.rowNumber} className="border-t border-gray-100">
                  <td className="p-3">{row.rowNumber}</td><td className="p-3"><div>{row.code || '—'}</div><div className="text-xs text-gray-500">{row.name || '—'}</div></td>
                  <td className={`p-3 ${row.errors.length ? 'text-red-700' : ''}`}>{actionLabels[row.action]}</td>
                  <td className="p-3">{row.errors.map((error, i) => <div className="text-red-700" key={`e${i}`}>{error}</div>)}{row.warnings.map((warning, i) => <div className="text-amber-800" key={`w${i}`}>{warning}</div>)}{!row.errors.length && !row.warnings.length && '通过'}
                    <details className="mt-1 text-xs text-gray-600"><summary className="cursor-pointer">查看导入值</summary>
                      <dl className="mt-2 space-y-1">{Object.entries(row.values).map(([key, value]) => <div key={key} className="break-all"><dt className="inline font-medium">{preview.fields.find(field => field.key === key)?.label || key}：</dt><dd className="inline">{value == null ? '（空）' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
                    </details>
                  </td>
                </tr>)}</tbody>
              </table>
              {!rows.length && <p className="p-4 text-sm text-gray-500">当前样本没有符合条件的行。</p>}
            </div>
            <p className="text-xs text-gray-500">统计覆盖整个文件，列表最多显示 100 条，优先显示错误和提示行。提交时会再次检查目标数据库和权限。</p>
          </section>
    </>
  )
}
