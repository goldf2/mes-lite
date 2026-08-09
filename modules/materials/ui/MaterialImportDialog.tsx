'use client'

import { useEffect, useState } from 'react'
import FormField, { appInputClassName, appSelectClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { importMaterials, MaterialApiError } from '../client'

export default function MaterialImportDialog({
  open,
  onClose,
  onMessage,
  onDownloadTemplate,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onMessage: (message: string) => void
  onDownloadTemplate: () => void
  onImported: () => Promise<void> | void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'skip' | 'update'>('skip')
  const [importing, setImporting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setFile(null)
    setMode('skip')
    setImporting(false)
    setErrors([])
  }, [open])

  const handleSubmit = async () => {
    if (!file) {
      onMessage('请先选择 CSV 文件')
      return
    }

    setImporting(true)
    setErrors([])
    try {
      const summary = await importMaterials(file, mode)
      const customerText = summary.customersCreated ? `，新建客户 ${summary.customersCreated}` : ''
      onMessage(`导入完成：共 ${summary.total || 0} 行，新增 ${summary.created || 0}，更新 ${summary.updated || 0}，跳过 ${summary.skipped || 0}${customerText}`)
      await onImported()
      onClose()
    } catch (error) {
      setErrors(error instanceof MaterialApiError && error.details.length > 0
        ? error.details
        : [error instanceof Error ? error.message : '导入失败'])
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <ModalDialog
      title="批量导入物料"
      description="仅导入物料主数据，不导入库存数量和成本。"
      onClose={onClose}
      closeDisabled={importing}
      size="lg"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={handleSubmit}
          confirmLabel="开始导入"
          busy={importing}
        />
      )}
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          物料编码是业务可视化编码，必须唯一；规格用于记录尺寸、材质、版本等描述。库存初始化请到库存管理做存货调整。
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FormField label="CSV 文件" required>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className={appInputClassName}
              />
            </FormField>
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              下载导入模板
            </button>
          </div>
          <FormField label="遇到已有物料编码" hint="更新模式只覆盖名称、规格、分类、客户、单位和成本方法，不修改库存余额。">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as 'skip' | 'update')}
              className={appSelectClassName}
            >
              <option value="skip">跳过已有物料</option>
              <option value="update">更新已有物料资料</option>
            </select>
          </FormField>
        </div>
        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <div className="text-sm font-semibold text-red-700">导入失败</div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-red-700">
              {errors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ModalDialog>
  )
}
