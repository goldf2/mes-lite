'use client'

import AppButton from '@/app/components/AppButton'
import { appInputClassName } from '@/app/components/FormField'
import SearchableSelect from '@/app/components/SearchableSelect'
import type { TaskDocumentRefInput, TaskOptionItem } from '../contracts/task-collaboration'

export default function TaskBomDocumentReferences({
  documentRefs, pending, fileOptions, canReadAttachments, onSearchFiles,
  onPendingChange, onUpdateVersion, onRemove, onAdd,
}: {
  documentRefs: TaskDocumentRefInput[]
  pending: { attachmentId: string; versionLabel: string }
  fileOptions: TaskOptionItem[]
  canReadAttachments: boolean
  onSearchFiles?: (keyword: string) => void | Promise<void>
  onPendingChange: (pending: { attachmentId: string; versionLabel: string }) => void
  onUpdateVersion: (attachmentId: string, versionLabel: string) => void
  onRemove: (attachmentId: string) => void
  onAdd: () => void
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/70 p-2.5">
      <div className="mb-1.5 text-xs font-medium text-gray-600">
        行关联加工图纸与业务版本（已绑定 {documentRefs.length} 份，保留全部引用，不自动伪造版本）
      </div>
      {documentRefs.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {documentRefs.map((ref) => {
            const matchedFile = fileOptions.find((f) => f.id === ref.attachmentId)
            return (
              <div
                key={ref.attachmentId}
                className="grid grid-cols-1 items-center gap-2 rounded border border-gray-200 bg-white px-2.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_11rem_auto]"
              >
                <span className="truncate text-xs font-medium text-gray-800">
                  {matchedFile?.label || matchedFile?.originalName || ref.attachmentId}
                </span>
                <input
                  type="text"
                  value={ref.versionLabel || ''}
                  onChange={(e) =>
                    onUpdateVersion(ref.attachmentId, e.target.value)
                  }
                  placeholder="业务版本（选填，不填则留空）"
                  className="h-8 rounded border border-gray-200 px-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => onRemove(ref.attachmentId)}
                  className="text-xs text-red-600 hover:underline"
                >
                  移除图纸
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
        <SearchableSelect
          value={pending.attachmentId}
          onChange={(attId) =>
            onPendingChange({ ...pending, attachmentId: attId })
          }
          onSearch={canReadAttachments ? onSearchFiles : undefined}
          disabled={!canReadAttachments}
          options={fileOptions.map((f) => ({
            value: f.id,
            label: f.label || f.originalName || f.id,
          }))}
          placeholder="选择要追加到本 BOM 行的图纸或技术附件"
        />
        <input
          type="text"
          value={pending.versionLabel}
          onChange={(e) =>
            onPendingChange({ ...pending, versionLabel: e.target.value })
          }
          placeholder="业务版本（选填）"
          className={appInputClassName}
        />
        <AppButton
          size="sm"
          variant="secondary"
          onClick={onAdd}
          disabled={!pending.attachmentId}
        >
          添加行图纸
        </AppButton>
      </div>
    </div>
  )
}
