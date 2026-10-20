'use client'

import { type ComponentProps, useState } from 'react'
import { Download, Eye, FileCheck2, Lock, Send, ShieldAlert } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import { AttachmentPanel, DocumentFileViewer } from '@/modules/attachments'
import { attachmentFileUrl } from '../client/task-collaboration-api'
import type {
  ResolvedTaskPermissions,
  TaskDocumentRef,
  TaskRecord,
  TaskReleaseManifestFile,
  TaskReleaseRecord,
} from '../contracts/task-collaboration'
import {
  formatNullableCounter,
  formatTaskDateTime,
  formatTaskExecutionStatus,
  formatTaskQuantity,
  isTaskEditableStatus,
  taskDeliveryMethodLabels,
  taskDeliveryStatusClasses,
  taskDeliveryStatusLabels,
  taskExecutionSourceLabels,
  taskProgressKindLabels,
  taskRecipientKindLabels,
} from '../model/task-collaboration-view'

type ViewerAttachmentInput = ComponentProps<typeof DocumentFileViewer>['attachment']

export default function TaskDetailWorkspace({
  task,
  permissions,
  busy,
  archiving = false,
  onNotice,
  onOpenEdit,
  onOpenAssign,
  onOpenProgress,
  onOpenReleasePreview,
  onOpenRecordDelivery,
  onExportReleaseManifest,
  onArchive,
  onRestore,
}: {
  task: TaskRecord
  permissions: ResolvedTaskPermissions
  busy: boolean
  archiving?: boolean
  onNotice: (message: string) => void
  onOpenEdit: () => void
  onOpenAssign: () => void
  onOpenProgress: () => void
  onOpenReleasePreview: () => void
  onOpenRecordDelivery: (release: TaskReleaseRecord) => void
  onExportReleaseManifest: (release: TaskReleaseRecord) => void
  onArchive: () => void
  onRestore: () => void
}) {
  const [previewDoc, setPreviewDoc] = useState<{
    viewerAttachment: ViewerAttachmentInput
    downloadUrl: string
    versionLabel?: string | null
  } | null>(null)

  const archived = Boolean(task.deletedAt) || archiving
  const editable = isTaskEditableStatus(task.status, archived) && permissions.canUpdate
  const canAssign = !archived && task.status === 'DRAFT' && permissions.canUpdate
  const canPublish =
    !archived &&
    task.status !== 'DRAFT' &&
    task.status !== 'CANCELLED' &&
    permissions.canUpdate &&
    permissions.canPublish

  const canUploadTaskAttachments = !archived && permissions.canUploadAttachments
  const canUpdateTaskAttachments = !archived && permissions.canUpdateAttachments
  const canArchiveTaskAttachments = !archived && permissions.canDeleteAttachments
  const attachmentPanelReadOnly =
    archived || (!canUploadTaskAttachments && !canUpdateTaskAttachments && !canArchiveTaskAttachments)

  const openDocumentRefViewer = (ref: TaskDocumentRef) => {
    if (archived || !permissions.canReadAttachments || ref.fileUnavailable || !ref.originalName || !ref.mimeType) {
      onNotice('该附件资料不可用、已归档或当前账号无访问权限，无法预览')
      return
    }
    const fileUrl = ref.originalUrl || ref.url || attachmentFileUrl(ref.attachmentId)
    setPreviewDoc({
      viewerAttachment: {
        id: ref.attachmentId,
        originalName: ref.originalName,
        mimeType: ref.mimeType,
        rotation: ref.rotation ?? 0,
        url: fileUrl,
        previewUrl: ref.previewUrl ?? fileUrl,
      },
      downloadUrl: fileUrl,
      versionLabel: ref.versionLabel,
    })
  }

  const openReleaseFileViewer = (file: TaskReleaseManifestFile) => {
    if (archived) {
      onNotice('归档文件当前不可访问，恢复后可预览')
      return
    }
    if (!permissions.canReadAttachments || !file.attachmentId || !file.originalName || !file.mimeType) {
      onNotice('发布包文件资料不完整或当前账号无附件读取权限，无法预览')
      return
    }
    // 严格使用冻结副本 file.attachmentId，严禁使用 sourceAttachmentId 代替冻结副本
    const frozenFileUrl = file.originalUrl || file.url || attachmentFileUrl(file.attachmentId)
    setPreviewDoc({
      viewerAttachment: {
        id: file.attachmentId,
        originalName: file.originalName,
        mimeType: file.mimeType,
        rotation: file.rotation ?? 0,
        url: frozenFileUrl,
        previewUrl: file.previewUrl ?? frozenFileUrl,
      },
      downloadUrl: frozenFileUrl,
      versionLabel: file.versionLabel,
    })
  }

  const renderRefButton = (ref: TaskDocumentRef, keyPrefix = '') => {
    const unavailable = Boolean(
      archived || !permissions.canReadAttachments || ref.fileUnavailable || !ref.originalName || !ref.mimeType,
    )
    if (unavailable) {
      return (
        <span
          key={`${keyPrefix}${ref.attachmentId}`}
          title={archived ? '已归档任务暂不提供原始附件预览' : '文件不可用或当前账号无附件读取权限'}
          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 py-1 text-[11px] text-gray-500"
        >
          <Lock className="h-3 w-3 text-gray-400" aria-hidden="true" />
          <span className="font-mono">{ref.originalName || ref.attachmentId}</span>
          {ref.versionLabel && <span className="font-mono">({ref.versionLabel})</span>}
          <span className="text-[10px] text-amber-700">{archived ? '归档不可访问' : '不可预览'}</span>
        </span>
      )
    }
    return (
      <button
        key={`${keyPrefix}${ref.attachmentId}`}
        type="button"
        onClick={() => openDocumentRefViewer(ref)}
        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50/70 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
      >
        <Eye className="h-3 w-3" aria-hidden="true" />
        <span>{ref.originalName}</span>
        {ref.versionLabel && <span className="font-mono text-gray-600">({ref.versionLabel})</span>}
      </button>
    )
  }

  const empDisplay = task.assigneeEmployee
    ? `${task.assigneeEmployee.name}${task.assigneeEmployee.code ? ` (${task.assigneeEmployee.code})` : ''}`
    : task.assigneeEmployeeName
      ? `${task.assigneeEmployeeName}${task.assigneeEmployeeCode ? ` (${task.assigneeEmployeeCode})` : ''}`
      : '未指定'
  const supplierDisplay = task.supplier?.name || task.supplierName || '未指定（内部生产）'
  const workCenterDisplay = task.workCenter?.name || task.workCenterName || '通用工作区'
  const salesOrderDisplay = task.salesOrder?.orderNo || task.salesOrderNo || '未关联'
  const productionOrderDisplay =
    task.execution.productionOrder?.orderNo ||
    task.productionOrderNo ||
    (task.productionOrderId ? `${task.productionOrderId} (不可访问/未提供)` : '未关联')
  const dispatchDisplay =
    task.execution.dispatch?.dispatchNo ||
    task.dispatchNo ||
    (task.dispatchId ? `${task.dispatchId} (不可访问/未提供)` : '未绑定')

  return (
    <div className="space-y-5 text-sm">
      {Boolean(task.deletedAt) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <span>该任务已归档（归档期间原附件禁止修改或访问，恢复后可继续查看）。</span>
          {permissions.canUpdate && (
            <AppButton size="sm" variant="secondary" onClick={onRestore} disabled={busy}>
              恢复归档
            </AppButton>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        {canAssign && (
          <AppButton size="sm" variant="primary" onClick={onOpenAssign} disabled={busy}>
            派工确认
          </AppButton>
        )}
        {!archived && permissions.canUpdate && (
          <AppButton size="sm" variant="secondary" onClick={onOpenProgress} disabled={busy}>
            登记进度 / 异常
          </AppButton>
        )}
        {canPublish && (
          <AppButton size="sm" variant="primary" onClick={onOpenReleasePreview} disabled={busy}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            发布资料清单
          </AppButton>
        )}
        {editable && (
          <AppButton size="sm" variant="secondary" onClick={onOpenEdit} disabled={busy}>
            编辑信息
          </AppButton>
        )}
        {!archived && permissions.canDelete && (
          <AppButton size="sm" variant="warning" onClick={onArchive} disabled={busy}>
            归档
          </AppButton>
        )}
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-900">基础与派工信息</h3>
        <dl className="mes-resource-detail-muted-card mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3.5 text-xs sm:grid-cols-3">
          <div>
            <dt className="mes-resource-detail-label">任务单号 / 版本</dt>
            <dd className="mes-resource-detail-value mt-1 font-mono font-semibold">{task.taskNo} · Rev.{task.revision}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">计划数量</dt>
            <dd className="mes-resource-detail-value mt-1 font-semibold">{formatTaskQuantity(task.quantity, task.unit)}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">要求交期</dt>
            <dd className="mes-resource-detail-value mt-1 font-medium">{formatTaskDateTime(task.dueAt)}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">内部负责人</dt>
            <dd className="mes-resource-detail-value mt-1 font-medium">{empDisplay}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">外协供应商</dt>
            <dd className="mes-resource-detail-value mt-1 font-medium">{supplierDisplay}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">工作中心</dt>
            <dd className="mes-resource-detail-value mt-1 font-medium">{workCenterDisplay}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">关联销售订单</dt>
            <dd className="mes-resource-detail-value mt-1 font-mono">{salesOrderDisplay}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">关联生产订单</dt>
            <dd className="mes-resource-detail-value mt-1 font-mono">{productionOrderDisplay}</dd>
          </div>
          <div>
            <dt className="mes-resource-detail-label">绑定生产派工单</dt>
            <dd className="mes-resource-detail-value mt-1 font-mono">{dispatchDisplay}</dd>
          </div>
        </dl>
        {task.instructions && (
          <div className="mt-2.5 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-xs leading-relaxed text-gray-700">
            <span className="font-semibold text-gray-900">作业与工艺说明：</span>
            {task.instructions}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">执行状态与实绩</h3>
          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {taskExecutionSourceLabels[task.execution.source]}
          </span>
        </div>
        {task.execution.source === 'MES' ? (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-gray-500">MES 执行状态</div>
                <div className="mt-1 font-semibold text-blue-900">{formatTaskExecutionStatus(task.execution)}</div>
              </div>
              <div>
                <div className="text-gray-500">工单/派工计划数</div>
                <div className="mt-1 font-mono font-semibold text-gray-900">
                  {formatNullableCounter(task.execution.productionOrder?.planQty ?? task.execution.dispatch?.planQty)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">MES 已确认完工</div>
                <div className="mt-1 font-mono font-semibold text-emerald-700">
                  {formatNullableCounter(task.execution.productionOrder?.completeQty)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">MES 已确认报废</div>
                <div className="mt-1 font-mono font-semibold text-red-600">
                  {formatNullableCounter(task.execution.productionOrder?.scrapQty)}
                </div>
              </div>
            </div>
            <p className="mt-2.5 border-t border-blue-100 pt-2 text-[11px] text-blue-800">
              说明：数量与状态直接读取自既有 MES 生产订单/派工实绩（无范围或未提供时显示“不可访问/未提供”，不伪造为 0）。
            </p>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            当前任务未绑定 MES 生产工单/派工单，执行状态为 <strong>{formatTaskExecutionStatus(task.execution)}</strong>，可通过“登记进度 / 异常”推进协同状态。
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">任务 BOM 明细与加工图纸</h3>
          <span className="text-xs text-gray-500">{task.lines.length} 项物料 · {task.documentRefs.length} 份主图纸</span>
        </div>

        {task.documentRefs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {task.documentRefs.map((ref) => renderRefButton(ref, 'task-doc-'))}
          </div>
        )}

        {task.lines.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
            未配置任务 BOM 物料明细
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5">物料编码 / 名称</th>
                  <th className="px-3 py-2.5 text-right">任务数量</th>
                  <th className="px-3 py-2.5">加工要求</th>
                  <th className="px-3 py-2.5">绑定图纸与版本</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {task.lines.map((line) => {
                  const matName = line.material?.name || line.materialName || line.materialId
                  const matCode = line.material?.code || line.materialCode || line.materialId
                  const matSpec = line.material?.spec ?? line.materialSpec
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{matName}</div>
                        <div className="font-mono text-[11px] text-blue-700">
                          {matCode}
                          {matSpec ? ` · ${matSpec}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                        {formatTaskQuantity(line.quantity, line.unit)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{line.note || '-'}</td>
                      <td className="px-3 py-2.5">
                        {line.documentRefs?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {line.documentRefs.map((ref) => renderRefButton(ref, `line-${line.id}-`))}
                          </div>
                        ) : (
                          <span className="text-gray-400">无行图纸</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        {archived ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <div className="font-semibold">归档任务附件当前不可访问</div>
            <p className="mt-1 text-amber-800">
              当前协同任务处于已归档状态，系统按归档隔离规则停止加载任务原始附件列表；任务 BOM 与下方历史发布资料包（冻结快照）仍可只读查阅，恢复归档后可继续访问原始附件。
            </p>
          </div>
        ) : permissions.canReadAttachments ? (
          <AttachmentPanel
            ownerType="TASK_COLLABORATION"
            ownerId={task.id}
            title="任务配套附件与原始图纸上传"
            readOnly={attachmentPanelReadOnly}
            canUpload={canUploadTaskAttachments}
            canUpdate={canUpdateTaskAttachments}
            canEdit={canUpdateTaskAttachments}
            canArchive={canArchiveTaskAttachments}
            onMessage={onNotice}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
            当前账号未开通附件读取权限，已隐藏任务附件列表与上传入口。
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">进度与异常时间线</h3>
          <span className="text-xs text-gray-500">共 {task.progress.length} 条记录（只追加）</span>
        </div>
        {task.progress.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
            暂无进度备注或异常记录
          </div>
        ) : (
          <ol className="mt-2 space-y-2.5">
            {task.progress.map((entry) => (
              <li
                key={entry.id}
                className={`rounded-lg border p-3 text-xs ${
                  entry.kind === 'EXCEPTION' ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                        entry.kind === 'EXCEPTION' ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {entry.kind === 'EXCEPTION' && <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
                      {taskProgressKindLabels[entry.kind]}
                    </span>
                    <span className="font-medium text-gray-900">{entry.actorName || entry.actorId}</span>
                  </div>
                  <time className="font-mono text-[11px] text-gray-500">{formatTaskDateTime(entry.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-gray-800">{entry.note}</p>
                {entry.attachmentRefs?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.attachmentRefs.map((ref) => renderRefButton(ref, `prog-${entry.id}-`))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">发布资料包与发放历史</h3>
          <span className="text-xs text-gray-500">共 {task.releases.length} 个不可变发布包</span>
        </div>
        {task.releases.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
            尚未生成发布资料包；派工后可点击“发布资料清单”锁定当前图纸与 BOM 版本。
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {task.releases.map((release) => (
              <article key={release.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-blue-800">
                        <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                        发布版本 Rev.{release.revision}
                      </span>
                      <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-gray-700">
                        收件对象：{taskRecipientKindLabels[release.manifest.recipient.kind]} · {release.manifest.recipient.name}
                      </span>
                    </div>
                    <div className="mt-1 text-gray-500">
                      发布时间：{formatTaskDateTime(release.createdAt)} · 执行方式：{taskExecutionSourceLabels[release.manifest.execution.source]}
                      {release.manifest.execution.productionOrderId
                        ? '（关联生产工单）'
                        : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <AppButton
                      size="sm"
                      variant="secondary"
                      onClick={() => onExportReleaseManifest(release)}
                      disabled={busy}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      导出 JSON 清单
                    </AppButton>
                    {permissions.canPublish && !archived && (
                      <AppButton
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenRecordDelivery(release)}
                        disabled={busy}
                      >
                        登记发放
                      </AppButton>
                    )}
                  </div>
                </div>

                {release.manifest.files.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-gray-200/80 pt-2.5">
                    {release.manifest.files.map((file) =>
                      !archived && permissions.canReadAttachments && file.attachmentId && file.originalName && file.mimeType ? (
                        <button
                          key={file.attachmentId}
                          type="button"
                          onClick={() => openReleaseFileViewer(file)}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 hover:border-blue-300 hover:text-blue-700"
                        >
                          <Eye className="h-3 w-3 text-blue-600" aria-hidden="true" />
                          <span>{file.originalName}</span>
                          <span className="font-mono text-[10px] text-gray-500">
                            [{file.versionLabel || (file.sourceDocumentVersion ? `v${file.sourceDocumentVersion}` : '冻结副本')}]
                          </span>
                        </button>
                      ) : (
                        <span
                          key={file.attachmentId || file.sourceAttachmentId}
                          title={archived ? '归档文件当前不可访问，恢复后可预览' : '文件不可用或当前账号无附件读取权限'}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 py-1 text-[11px] text-gray-500"
                        >
                          <Lock className="h-3 w-3 text-gray-400" aria-hidden="true" />
                          <span>{file.originalName || file.attachmentId}</span>
                          <span className="text-[10px] text-amber-700">{archived ? '归档不可访问' : '不可预览'}</span>
                        </span>
                      ),
                    )}
                  </div>
                )}

                <div className="mt-2.5 border-t border-gray-200/80 pt-2">
                  <div className="font-medium text-gray-700">发放记录（{release.deliveries.length} 条）</div>
                  {release.deliveries.length === 0 ? (
                    <div className="mt-1 text-gray-400">暂无发放留痕</div>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {release.deliveries.map((delivery) => (
                        <li
                          key={delivery.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-white px-2.5 py-1.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${taskDeliveryStatusClasses[delivery.status]}`}>
                              {taskDeliveryStatusLabels[delivery.status]}
                            </span>
                            <span className="font-medium text-gray-800">{taskDeliveryMethodLabels[delivery.method]}</span>
                            <span className="text-gray-500">→ {delivery.recipientName}</span>
                            {delivery.note && <span className="text-gray-600">（{delivery.note}）</span>}
                          </div>
                          <span className="font-mono text-[11px] text-gray-400">{formatTaskDateTime(delivery.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {previewDoc && (
        <ModalDialog
          title={previewDoc.viewerAttachment.originalName}
          description={previewDoc.versionLabel ? `业务版本：${previewDoc.versionLabel} · 只读受控预览` : '只读受控预览'}
          onClose={() => setPreviewDoc(null)}
          size="wide"
          bodyClassName="!p-0 bg-slate-950"
          headerActions={(
            <a
              href={previewDoc.downloadUrl}
              download={previewDoc.viewerAttachment.originalName}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载原文件
            </a>
          )}
        >
          <div className="h-[min(74dvh,780px)] bg-slate-950">
            <DocumentFileViewer attachment={previewDoc.viewerAttachment} />
          </div>
        </ModalDialog>
      )}
    </div>
  )
}
