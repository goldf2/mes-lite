'use client'

import { useEffect, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName, appSelectClassName } from '@/app/components/FormField'
import ModalDialog from '@/app/components/ModalDialog'
import { importMaterials, previewMaterialImport, MaterialApiError } from '../client'
import MaterialImportReview from './MaterialImportReview'
import type { MaterialImportOptions, MaterialImportPreview } from '../contracts/material-import'

export default function MaterialImportDialog({ open, onClose, onMessage, onDownloadTemplate, onImported }: {
  open: boolean
  onClose: () => void
  onMessage: (message: string) => void
  onDownloadTemplate: () => void
  onImported: () => Promise<void> | void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<MaterialImportOptions>({ mode: 'skip', headerRow: 1 })
  const [preview, setPreview] = useState<MaterialImportPreview | null>(null)
  const [worksheets, setWorksheets] = useState<MaterialImportPreview['worksheets']>([])
  const [previewCurrent, setPreviewCurrent] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const generation = useRef(0)

  useEffect(() => {
    generation.current += 1
    if (!open) return
    setFile(null)
    setOptions({ mode: 'skip', headerRow: 1 })
    setPreview(null)
    setWorksheets([])
    setPreviewCurrent(false)
    setBusy(null)
    setErrors([])
  }, [open])
  const changeOptions = (next: MaterialImportOptions) => {
    generation.current += 1
    setOptions(next)
    setPreviewCurrent(false)
    setErrors([])
  }
  const showError = (error: unknown) => setErrors(error instanceof MaterialApiError && error.details.length
    ? error.details : [error instanceof Error ? error.message : '操作失败'])

  const handlePreview = async () => {
    if (!file) return
    const current = ++generation.current
    setBusy('preview')
    setErrors([])
    setPreviewCurrent(false)
    try {
      const result = await previewMaterialImport(file, options)
      if (current !== generation.current) return
      setPreview(result)
      setWorksheets(result.worksheets)
      setOptions({ ...options, worksheet: result.worksheet, headerRow: result.headerRow, mapping: result.mapping })
      setPreviewCurrent(true)
    } catch (error) {
      if (current === generation.current) showError(error)
    } finally {
      if (current === generation.current) setBusy(null)
    }
  }

  const handleCommit = async () => {
    if (!file || !previewCurrent || !preview?.canCommit || busy) return
    setBusy('commit')
    setErrors([])
    try {
      const summary = await importMaterials(file, options.mode || 'skip', options)
      onMessage(`导入完成：共 ${summary.total || 0} 行，新增 ${summary.created || 0}，更新 ${summary.updated || 0}，跳过 ${summary.skipped || 0}`)
      onClose()
      void Promise.resolve().then(onImported).catch(() => onMessage('物料已导入，但列表刷新失败，请稍后重试'))
    } catch (error) {
      showError(error)
      setPreviewCurrent(false)
    } finally {
      setBusy(null)
    }
  }

  const mapColumn = (column: number, target: string) => {
    const mapping = { ...options.mapping }
    for (const key of Object.keys(mapping)) if (mapping[key] === column) mapping[key] = null
    if (target) mapping[target] = column
    changeOptions({ ...options, mapping })
  }

  if (!open) return null
  const canCommit = Boolean(previewCurrent && preview?.canCommit && !busy)

  return (
    <ModalDialog title="批量导入物料" description="选择文件并核对列对应，预览无误后确认导入。" onClose={onClose}
      closeDisabled={Boolean(busy)} size="wide" footer={(
        <>
          <AppButton onClick={onClose} disabled={Boolean(busy)}>取消</AppButton>
          <AppButton onClick={handlePreview} disabled={!file || Boolean(busy)}>
            {busy === 'preview' ? '正在预览…' : preview ? '重新预览' : '读取并预览'}
          </AppButton>
          <AppButton variant="primary" onClick={handleCommit} disabled={!canCommit}>
            {busy === 'commit' ? '正在导入…' : '确认导入'}
          </AppButton>
        </>
      )}>
      <div className="space-y-5" aria-busy={Boolean(busy)}>
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          物料编码唯一。此处维护物料资料；库存数量和成本请通过现有库存业务录入。缺少图号、机型或材质可后补。
        </p>
        <fieldset disabled={Boolean(busy)} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <FormField label="Excel / CSV 文件" required hint="支持 .xlsx 和 UTF-8 CSV。">
              <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={appInputClassName} onChange={event => {
                  generation.current += 1
                  setFile(event.target.files?.[0] || null)
                  setPreview(null)
                  setWorksheets([])
                  setPreviewCurrent(false)
                  setOptions({ mode: options.mode || 'skip', headerRow: 1 })
                  setErrors([])
                }} />
            </FormField>
            <AppButton variant="ghost" size="sm" onClick={onDownloadTemplate}>下载导入模板</AppButton>
          </div>
          <FormField label="已有物料编码" hint="更新仅处理选中的字段；未对应的字段保留原值。">
            <select className={appSelectClassName} value={options.mode} onChange={event => changeOptions({ ...options, mode: event.target.value as 'skip' | 'update' })}>
              <option value="skip">跳过已有物料</option><option value="update">更新已有物料资料</option>
            </select>
          </FormField>
          <FormField label="表头所在行" hint="例如第 6 行是字段名，则填 6。改变后重新读取列。">
            <input className={appInputClassName} type="number" min={1} step={1} value={options.headerRow || ''}
              onChange={event => { changeOptions({ ...options, headerRow: Number(event.target.value), mapping: undefined }); setPreview(null) }} />
          </FormField>
          {worksheets.length > 0 && <FormField label="工作表">
            <select className={appSelectClassName} value={options.worksheet || worksheets[0]?.name} onChange={event => {
              changeOptions({ ...options, worksheet: event.target.value, mapping: undefined }); setPreview(null)
            }}>
              {worksheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}（{sheet.rows} 行）</option>)}
            </select>
          </FormField>}
          <FormField label="缺少库存单位时" hint="仅在没有对应库存单位列时使用；零件可统一选件。">
            <select className={appSelectClassName} value={String(options.defaults?.stockUnit || '')} onChange={event => changeOptions({
              ...options, defaults: event.target.value ? { stockUnit: event.target.value } : {},
            })}>
              <option value="">由文件提供（必填）</option><option value="件">统一使用件</option>
            </select>
          </FormField>
        </fieldset>
        {errors.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <ul className="max-h-48 space-y-1 overflow-y-auto">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
        </div>}
        {preview && <MaterialImportReview preview={preview} options={options} previewCurrent={previewCurrent}
          busy={Boolean(busy)} mapColumn={mapColumn} />}
      </div>
    </ModalDialog>
  )
}
