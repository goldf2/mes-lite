'use client'

import { useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName, appSelectClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import SearchableSelect from '@/app/components/SearchableSelect'
import type { TaskOptionItem, TaskProgressKind, TaskRecord } from '../contracts/task-collaboration'
import { allowedManualTransitions, taskExecutionSourceLabels, taskStatusLabels } from '../model/task-collaboration-view'

export function TaskAssignModal({
  task,
  dispatches,
  canReadDispatches = true,
  onSearchDispatches,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  task: TaskRecord
  dispatches: TaskOptionItem[]
  canReadDispatches?: boolean
  onSearchDispatches?: (keyword: string) => void | Promise<void>
  busy: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (dispatchId?: string | null) => void
}) {
  const [dispatchId, setDispatchId] = useState<string>(task.dispatchId || '')
  const matchingDispatches = dispatches.filter((item) => {
    if (task.productionOrderId && item.orderId && item.orderId !== task.productionOrderId) return false
    return true
  })
  const hasAssigneeOrSupplier = Boolean(task.assigneeEmployeeId || task.supplierId || dispatchId)
  const employeeDisplay = task.assigneeEmployee?.name || task.assigneeEmployeeName || '未指定'
  const supplierDisplay = task.supplier?.name || task.supplierName || '未指定'

  return (
    <ModalDialog
      title={`派工确认 · ${task.taskNo}`}
      description="将草稿任务转为“已派工 (ASSIGNED)”。若关联既有生产派工单，仅建立协同引用，不重复创建派工引擎记录。"
      onClose={onClose}
      closeDisabled={busy}
      size="md"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() => onConfirm(dispatchId || null)}
          confirmLabel="确认派工"
          busy={busy}
          disabled={!hasAssigneeOrSupplier}
        />
      )}
    >
      <div className="space-y-4 text-sm">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">任务标题</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{task.title}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">当前乐观锁版本</dt>
            <dd className="mt-0.5 font-mono text-xs text-gray-700">Rev.{task.revision}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">内部负责人</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{employeeDisplay}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">外协供应商</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{supplierDisplay}</dd>
          </div>
        </dl>

        <FormField
          label="绑定既有生产派工单（可选）"
          hint={
            canReadDispatches
              ? '须与任务所选生产订单、员工及工作中心范围一致；供应商外协任务无需绑定内部派工单。'
              : '当前账号无 dispatch.read 权限，不可检索绑定生产派工单。'
          }
        >
          <SearchableSelect
            value={dispatchId}
            onChange={setDispatchId}
            onSearch={canReadDispatches ? onSearchDispatches : undefined}
            disabled={!canReadDispatches}
            allowClear
            options={matchingDispatches.map((item) => ({
              value: item.id,
              label: item.label,
              keywords: `${item.code || ''} ${item.dispatchNo || ''} ${item.orderNo || ''}`,
            }))}
            placeholder="输入派工单号、工单号或员工筛选"
            emptyText="当前无匹配的既有派工单"
          />
        </FormField>

        {!hasAssigneeOrSupplier && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            派工前必须已在任务草稿中指定内部负责人、外协供应商，或在上方绑定既有生产派工单。
          </p>
        )}
      </div>
    </ModalDialog>
  )
}

export function TaskProgressModal({
  task,
  fileOptions,
  canReadFiles = true,
  onSearchFiles,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  task: TaskRecord
  fileOptions: TaskOptionItem[]
  canReadFiles?: boolean
  onSearchFiles?: (keyword: string) => void | Promise<void>
  busy: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (input: {
    kind: TaskProgressKind
    note: string
    attachmentRefs: Array<{ attachmentId: string; versionLabel?: string }>
    expectedRevision?: number
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  }) => void
}) {
  const [kind, setKind] = useState<TaskProgressKind>('NOTE')
  const [note, setNote] = useState('')
  const [nextStatus, setNextStatus] = useState<'' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('')
  const [selectedAttachmentId, setSelectedAttachmentId] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [attachmentRefs, setAttachmentRefs] = useState<Array<{ attachmentId: string; versionLabel?: string }>>([])

  const transitions = allowedManualTransitions(task)
  const isMesDriven = task.execution.source === 'MES'

  const addAttachmentRef = () => {
    if (!selectedAttachmentId) return
    if (attachmentRefs.some((item) => item.attachmentId === selectedAttachmentId)) return
    const trimmedLabel = versionLabel.trim()
    setAttachmentRefs((current) => [
      ...current,
      {
        attachmentId: selectedAttachmentId,
        ...(trimmedLabel ? { versionLabel: trimmedLabel } : {}),
      },
    ])
    setSelectedAttachmentId('')
    setVersionLabel('')
  }

  return (
    <ModalDialog
      title={`登记任务进度 / 异常 · ${task.taskNo}`}
      description={`当前状态：${taskStatusLabels[task.status]} · 执行来源：${taskExecutionSourceLabels[task.execution.source]}`}
      onClose={onClose}
      closeDisabled={busy}
      size="lg"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() =>
            onSubmit({
              kind,
              note: note.trim(),
              attachmentRefs,
              ...(nextStatus ? { status: nextStatus, expectedRevision: task.revision } : {}),
            })
          }
          confirmLabel="提交记录"
          busy={busy}
          disabled={!note.trim()}
        />
      )}
    >
      <div className="space-y-4 text-sm">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {isMesDriven ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-900">
            <div className="font-semibold">MES 实绩只读联动约束</div>
            <div className="mt-1 text-blue-800">
              当前任务已绑定生产订单/派工单，完工数量、报废数量和执行状态由 MES 班后实绩自动投影。此处仅登记协同备注或现场异常，不接受完工数量录入，也不会触发库存或财务过账。
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-700">
            当前为协同自管任务（未关联 MES 生产订单/派工单），可在追加进度说明的同时更新任务状态；协同记录不自动产生库存或成本过账。
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="记录类型" required>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="记录类型">
              {([
                ['NOTE', '进度备注'],
                ['EXCEPTION', '异常上报'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                  className={`h-10 rounded-lg border text-sm font-medium transition ${
                    kind === value
                      ? value === 'EXCEPTION'
                        ? 'border-red-600 bg-red-50 text-red-700'
                        : 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          {!isMesDriven && transitions.length > 0 && (
            <FormField label="同步变更任务状态（可选）" hint={`提交状态变更时将校验版本 Rev.${task.revision}`}>
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)}
                className={appSelectClassName}
              >
                <option value="">保持当前状态（{taskStatusLabels[task.status]}）</option>
                {transitions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </FormField>
          )}
        </div>

        <FormField label={kind === 'EXCEPTION' ? '异常情况与现场处理说明' : '进度说明'} required>
          <textarea
            rows={4}
            maxLength={10000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              kind === 'EXCEPTION'
                ? '请描述尺寸偏差、来料缺陷、设备异常或交期风险，支持关联现场照片或检测报告附件…'
                : '请填写当前工序进展、外协回传情况或交接说明…'
            }
            className={appTextareaClassName}
          />
        </FormField>

        <div className="rounded-lg border border-gray-200 p-3">
          <div className="mb-2 text-xs font-semibold text-gray-700">关联任务附件（可选）</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <SearchableSelect
              value={selectedAttachmentId}
              onChange={setSelectedAttachmentId}
              onSearch={canReadFiles ? onSearchFiles : undefined}
              disabled={!canReadFiles}
              options={fileOptions.map((file) => ({
                value: file.id,
                label: file.label || file.originalName || file.id,
              }))}
              placeholder="选择已上传到本任务的现场图片或凭证"
              emptyText="暂无可选任务附件，请先在详情附件区上传"
            />
            <input
              type="text"
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              placeholder="版本标记（选填）"
              className={appInputClassName}
            />
            <AppButton variant="secondary" onClick={addAttachmentRef} disabled={!selectedAttachmentId}>
              添加引用
            </AppButton>
          </div>
          {attachmentRefs.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {attachmentRefs.map((ref) => {
                const matched = fileOptions.find((item) => item.id === ref.attachmentId)
                return (
                  <span
                    key={ref.attachmentId}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-800"
                  >
                    <span>{matched?.label || ref.attachmentId}</span>
                    {ref.versionLabel && <span className="rounded bg-white px-1 text-[11px] text-gray-600">{ref.versionLabel}</span>}
                    <button
                      type="button"
                      onClick={() => setAttachmentRefs((current) => current.filter((item) => item.attachmentId !== ref.attachmentId))}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="移除附件引用"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  )
}
