'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import { createOperationId } from '../client/task-collaboration-api'
import type {
  TaskDeliveryMethod,
  TaskDeliveryStatus,
  TaskRecipient,
  TaskRecipientKind,
  TaskRecord,
  TaskReleasePreviewResponse,
  TaskReleaseRecord,
} from '../contracts/task-collaboration'
import {
  defaultTaskRecipient,
  formatNullableCounter,
  formatTaskExecutionStatus,
  formatTaskQuantity,
  isSameRecipient,
  taskDeliveryMethodLabels,
  taskDeliveryStatusLabels,
  taskExecutionSourceLabels,
  taskRecipientKindLabels,
} from '../model/task-collaboration-view'

function formatBytes(size: number) {
  if (!size || size < 1024) return `${size || 0} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export function TaskReleasePublishModal({
  task,
  preview,
  previewBusy,
  publishBusy,
  error,
  onClose,
  onRequestPreview,
  onInvalidatePreview,
  onConfirmPublish,
}: {
  task: TaskRecord
  preview: TaskReleasePreviewResponse | null
  previewBusy: boolean
  publishBusy: boolean
  error?: string | null
  onClose: () => void
  onRequestPreview: (recipient: TaskRecipient) => void
  onInvalidatePreview: () => void
  onConfirmPublish: (recipient: TaskRecipient, previewToken: string, operationId: string) => void
}) {
  const initialRecipient = useMemo(() => defaultTaskRecipient(task), [task])
  const [recipientKind, setRecipientKind] = useState<TaskRecipientKind>(initialRecipient.kind)
  const [recipientId, setRecipientId] = useState<string>(initialRecipient.id || '')
  const [recipientName, setRecipientName] = useState<string>(initialRecipient.name)
  const operationIdRef = useRef<string>(createOperationId('publish'))
  const lastPreviewTokenRef = useRef<string>('')

  const employeeName = task.assigneeEmployee?.name || task.assigneeEmployeeName || task.assigneeEmployeeId || ''
  const supplierName = task.supplier?.name || task.supplierName || task.supplierId || ''

  useEffect(() => {
    if (preview?.previewToken && preview.previewToken !== lastPreviewTokenRef.current) {
      lastPreviewTokenRef.current = preview.previewToken
      operationIdRef.current = createOperationId('publish')
    }
  }, [preview?.previewToken])

  const handleKindChange = (nextKind: TaskRecipientKind) => {
    setRecipientKind(nextKind)
    if (nextKind === 'EMPLOYEE' && task.assigneeEmployeeId) {
      setRecipientId(task.assigneeEmployeeId)
      setRecipientName(employeeName)
    } else if (nextKind === 'SUPPLIER' && task.supplierId) {
      setRecipientId(task.supplierId)
      setRecipientName(supplierName)
    } else {
      setRecipientId('')
      setRecipientName(task.workCenter?.name ? `${task.workCenter.name}内部归档` : '生产协同内部留档')
    }
    if (preview) onInvalidatePreview()
  }

  const handleNameChange = (nextName: string) => {
    setRecipientName(nextName)
    if (preview) onInvalidatePreview()
  }

  const currentRecipient: TaskRecipient = {
    kind: recipientKind,
    ...(recipientId ? { id: recipientId } : {}),
    name: recipientName.trim(),
  }

  const isPreviewMatching = Boolean(
    preview &&
      preview.previewToken &&
      preview.revision === task.revision &&
      isSameRecipient(preview.recipient, currentRecipient),
  )

  return (
    <ModalDialog
      title={`发布任务资料包 · ${task.taskNo}`}
      description="发布前请核对收件对象、任务、BOM 和图纸版本。发布后原图纸更新不会覆盖已发布资料。"
      onClose={onClose}
      closeDisabled={previewBusy || publishBusy}
      size="xl"
      footer={(
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={previewBusy || publishBusy}>
            取消
          </AppButton>
          <AppButton
            variant="secondary"
            onClick={() => onRequestPreview(currentRecipient)}
            disabled={previewBusy || publishBusy || !currentRecipient.name}
          >
            {previewBusy ? '生成预览中…' : preview ? '重新生成预览' : '生成发布预览'}
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() =>
              preview &&
              isPreviewMatching &&
              onConfirmPublish(currentRecipient, preview.previewToken, operationIdRef.current)
            }
            disabled={!isPreviewMatching || previewBusy || publishBusy}
          >
            {publishBusy ? '正在冻结发布…' : '确认正式发布'}
          </AppButton>
        </>
      )}
    >
      <div className="space-y-5 text-sm">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div>{error}</div>
            <div className="mt-1 font-mono text-[11px] text-red-600">
              可直接重试，重复提交不会生成重复发布包。
            </div>
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-gray-900">1. 核对收件对象与任务版本</h4>
            <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-medium text-blue-800">
              待发布版本 Rev.{task.revision}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="收件对象类型" required>
              <select
                value={recipientKind}
                onChange={(event) => handleKindChange(event.target.value as TaskRecipientKind)}
                className={appSelectClassName}
              >
                {task.assigneeEmployeeId && <option value="EMPLOYEE">内部员工（匹配任务负责人）</option>}
                {task.supplierId && <option value="SUPPLIER">外协供应商（匹配任务供应商）</option>}
                <option value="INTERNAL">内部留档</option>
              </select>
            </FormField>
            <FormField label="收件方名称" required hint="变更收件方或任务版本后，必须重新生成发布预览">
              <input
                type="text"
                value={recipientName}
                onChange={(event) => handleNameChange(event.target.value)}
                readOnly={recipientKind !== 'INTERNAL'}
                className={appInputClassName}
              />
            </FormField>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-gray-900">2. 发布资料清单预览</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                发布时将保留当前图纸与配套文件的只读副本，并锁定任务与 BOM 清单。
              </p>
            </div>
            {isPreviewMatching && preview?.previewToken && (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-800">
                资料清单与当前版本一致
              </span>
            )}
          </div>

          {!preview || !isPreviewMatching ? (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-4 py-7 text-center text-sm text-amber-900">
              <div>
                {preview && !isPreviewMatching
                  ? '收件对象或任务版本已变更，请重新生成发布预览。'
                  : '尚未生成当前收件对象与版本的发布资料预览。'}
              </div>
              <div className="mt-3">
                <AppButton
                  size="sm"
                  variant="primary"
                  onClick={() => onRequestPreview(currentRecipient)}
                  disabled={previewBusy || !currentRecipient.name}
                >
                  {previewBusy ? '生成预览中…' : '一键生成发布预览'}
                </AppButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-gray-500">任务单号 / 版本</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-gray-900">
                    {preview.task.taskNo} · Rev.{preview.revision}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">收件对象</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">
                    {taskRecipientKindLabels[preview.recipient.kind]} · {preview.recipient.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">任务数量</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">
                    {formatTaskQuantity(preview.task.quantity, preview.task.unit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">当前执行状态</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">
                    {taskExecutionSourceLabels[preview.execution.source]} · {formatTaskExecutionStatus(preview.execution)}
                    {preview.execution.productionOrder
                      ? ` (完工 ${formatNullableCounter(preview.execution.productionOrder.completeQty)})`
                      : ''}
                  </dd>
                </div>
              </dl>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-gray-700">
                  冻结 BOM 明细（{preview.task.lines.length} 项）
                </div>
                {preview.task.lines.length === 0 ? (
                  <div className="rounded border border-gray-100 px-3 py-2 text-xs text-gray-400">未配置任务 BOM 明细</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2">物料编码</th>
                          <th className="px-3 py-2">物料名称</th>
                          <th className="px-3 py-2 text-right">需求数量</th>
                          <th className="px-3 py-2">加工说明</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.task.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-3 py-2 font-mono text-blue-700">
                              {line.material?.code || line.materialCode || line.materialId}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {line.material?.name || line.materialName || '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {formatTaskQuantity(line.quantity, line.unit)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{line.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-gray-700">
                  冻结图纸与配套文件清单（{preview.files.length} 个文件）
                </div>
                {preview.files.length === 0 ? (
                  <div className="rounded border border-gray-100 px-3 py-2 text-xs text-gray-400">本次发布不包含关联文件</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2">文件名</th>
                          <th className="px-3 py-2">业务版本标签</th>
                          <th className="px-3 py-2">归属层级</th>
                          <th className="px-3 py-2">大小</th>
                          <th className="px-3 py-2">SHA-256 摘要</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.files.map((file, idx) => (
                          <tr key={`${file.sourceAttachmentId || file.attachmentId}-${file.bomLineId || 'task'}-${idx}`}>
                            <td className="px-3 py-2 font-medium text-gray-900">{file.originalName}</td>
                            <td className="px-3 py-2">
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] text-blue-700">
                                {file.versionLabel || (file.sourceDocumentVersion ? `源版本 v${file.sourceDocumentVersion}` : '未标注版本')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{file.bomLineId ? 'BOM 明细图纸' : '任务主附件'}</td>
                            <td className="px-3 py-2 text-gray-500">{formatBytes(file.size)}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-gray-500">
                              {file.sha256 ? `${file.sha256.slice(0, 16)}…` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </ModalDialog>
  )
}

export function TaskDeliveryRecordModal({
  task,
  release,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  task: TaskRecord
  release: TaskReleaseRecord
  busy: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (input: { operationId: string; method: TaskDeliveryMethod; status: TaskDeliveryStatus; note?: string }) => void
}) {
  const [method, setMethod] = useState<TaskDeliveryMethod>('MANUAL')
  const [status, setStatus] = useState<TaskDeliveryStatus>('RECORDED')
  const [note, setNote] = useState('')
  const operationIdRef = useRef<string>(createOperationId('delivery'))

  const resetOperationIdOnInputChange = () => {
    operationIdRef.current = createOperationId('delivery')
  }

  return (
    <ModalDialog
      title={`登记发放记录 · ${task.taskNo} (Rev.${release.revision})`}
      description={`收件对象：${release.manifest.recipient.name} · 本操作仅记录人工发放或导出凭证，不直接外发真实邮件或微信消息。`}
      onClose={onClose}
      closeDisabled={busy}
      size="md"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() =>
            onSubmit({
              operationId: operationIdRef.current,
              method,
              status,
              note: note.trim() || undefined,
            })
          }
          confirmLabel="保存发放记录"
          busy={busy}
        />
      )}
    >
      <div className="space-y-4 text-sm">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div>{error}</div>
            <div className="mt-1 font-mono text-[11px] text-red-600">
              可直接重试，重复提交不会新增重复发放记录。
            </div>
          </div>
        )}
        <FormField label="发放方式" required>
          <select
            value={method}
            onChange={(event) => {
              const next = event.target.value as TaskDeliveryMethod
              setMethod(next)
              if (next === 'EXPORT') setStatus('EXPORTED')
              resetOperationIdOnInputChange()
            }}
            className={appSelectClassName}
          >
            {(Object.keys(taskDeliveryMethodLabels) as TaskDeliveryMethod[]).map((key) => (
              <option key={key} value={key}>{taskDeliveryMethodLabels[key]}</option>
            ))}
          </select>
        </FormField>

        <FormField label="发放状态" required>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as TaskDeliveryStatus)
              resetOperationIdOnInputChange()
            }}
            className={appSelectClassName}
          >
            {(Object.keys(taskDeliveryStatusLabels) as TaskDeliveryStatus[]).map((key) => (
              <option key={key} value={key}>{taskDeliveryStatusLabels[key]}</option>
            ))}
          </select>
        </FormField>

        <FormField label="发放凭证说明（可选）" hint="可填写纸质签收人、邮件主题/发送时间或微信群回执说明">
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              resetOperationIdOnInputChange()
            }}
            placeholder="例如：已打印图纸清单一式两份由车间班组长王工签字领用"
            className={appTextareaClassName}
          />
        </FormField>
      </div>
    </ModalDialog>
  )
}
