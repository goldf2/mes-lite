'use client'

import { useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import FormField, { appInputClassName, appTextareaClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import NumberInputField from '@/app/components/NumberInputField'
import SearchableSelect from '@/app/components/SearchableSelect'
import OneToManyRelationField from '@/app/components/relations/OneToManyRelationField'
import TaskBomDocumentReferences from './TaskBomDocumentReferences'
import type {
  ResolvedTaskPermissions,
  TaskBomLineInput,
  TaskDocumentRefInput,
  TaskDraftInput,
  TaskOptionItem,
  TaskOptionType,
  TaskRecord,
} from '../contracts/task-collaboration'
import {
  draftFromTaskRecord,
  formatIsoToLocalDateTimeInput,
  localDateTimeInputToIso,
} from '../model/task-collaboration-view'

interface EditableBomLine extends TaskBomLineInput {
  clientKey: string
  documentRefs: TaskDocumentRefInput[]
}

function toEditableLines(lines: TaskBomLineInput[]): EditableBomLine[] {
  return (lines || []).map((line, index) => ({
    ...line,
    clientKey: line.id || `bom-line-${index}-${line.materialId}`,
    documentRefs: (line.documentRefs || []).map((ref) => ({
      attachmentId: ref.attachmentId,
      ...(ref.versionLabel ? { versionLabel: ref.versionLabel } : {}),
    })),
  }))
}

export default function TaskDraftDialog({
  open,
  sessionKey,
  editingTask,
  initialDraft,
  templateCandidates,
  materialOptions,
  employeeOptions,
  supplierOptions,
  orderOptions,
  salesOrderOptions,
  workCenterOptions,
  fileOptions,
  onSearchOptions,
  permissions,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  sessionKey: string
  editingTask: TaskRecord | null
  initialDraft: TaskDraftInput
  templateCandidates: TaskRecord[]
  materialOptions: TaskOptionItem[]
  employeeOptions: TaskOptionItem[]
  supplierOptions: TaskOptionItem[]
  orderOptions: TaskOptionItem[]
  salesOrderOptions: TaskOptionItem[]
  workCenterOptions: TaskOptionItem[]
  fileOptions: TaskOptionItem[]
  onSearchOptions?: (type: TaskOptionType, keyword: string) => void | Promise<void>
  permissions: ResolvedTaskPermissions
  busy: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (draft: TaskDraftInput) => void
}) {
  const [draft, setDraft] = useState<Omit<TaskDraftInput, 'lines'>>(() => {
    const { lines: _lines, ...rest } = initialDraft
    return rest
  })
  const [lines, setLines] = useState<EditableBomLine[]>(() => toEditableLines(initialDraft.lines))
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialDraft.templateTaskId || '')
  const [newDocAttachmentId, setNewDocAttachmentId] = useState('')
  const [newDocVersionLabel, setNewDocVersionLabel] = useState('')
  const [addingMaterialId, setAddingMaterialId] = useState('')
  const [linePendingDocByKey, setLinePendingDocByKey] = useState<Record<string, { attachmentId: string; versionLabel: string }>>({})

  useEffect(() => {
    if (!open) return
    const { lines: initLines, ...rest } = initialDraft
    setDraft(rest)
    setLines(toEditableLines(initLines))
    setSelectedTemplateId(initialDraft.templateTaskId || '')
    setNewDocAttachmentId('')
    setNewDocVersionLabel('')
    setAddingMaterialId('')
    setLinePendingDocByKey({})
  }, [open, sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const applyTemplate = (taskId: string) => {
    setSelectedTemplateId(taskId)
    const source = templateCandidates.find((item) => item.id === taskId)
    if (!source) {
      setDraft((current) => ({ ...current, templateTaskId: undefined }))
      return
    }
    const copied = draftFromTaskRecord(source, true)
    setDraft((current) => ({
      ...current,
      title: current.title.trim() ? current.title : copied.title,
      workCenterId: current.workCenterId || copied.workCenterId,
      unit: current.unit || copied.unit,
      instructions: copied.instructions,
      documentRefs: copied.documentRefs,
      templateTaskId: source.id,
    }))
    setLines(toEditableLines(copied.lines))
  }

  const addTaskDocRef = () => {
    if (!newDocAttachmentId) return
    if (draft.documentRefs.some((ref) => ref.attachmentId === newDocAttachmentId)) return
    const trimmedVer = newDocVersionLabel.trim()
    setDraft((current) => ({
      ...current,
      documentRefs: [
        ...current.documentRefs,
        {
          attachmentId: newDocAttachmentId,
          ...(trimmedVer ? { versionLabel: trimmedVer } : {}),
        },
      ],
    }))
    setNewDocAttachmentId('')
    setNewDocVersionLabel('')
  }

  const updateTaskDocRefVersion = (attachmentId: string, versionLabel: string) => {
    setDraft((current) => ({
      ...current,
      documentRefs: current.documentRefs.map((ref) =>
        ref.attachmentId === attachmentId
          ? { attachmentId, ...(versionLabel.trim() ? { versionLabel: versionLabel.trim() } : {}) }
          : ref,
      ),
    }))
  }

  const addBomLine = (materialId: string) => {
    if (!materialId) return
    const material = materialOptions.find((item) => item.id === materialId)
    const defaultUnit = String(material?.stockUnit || material?.unit || '件')
    const nextLine: EditableBomLine = {
      clientKey: `bom-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      materialId,
      quantity: 1,
      unit: defaultUnit,
      note: '',
      documentRefs: [],
    }
    setLines((current) => [...current, nextLine])
    setAddingMaterialId('')
  }

  const updateBomLine = (clientKey: string, patch: Partial<EditableBomLine>) => {
    setLines((current) =>
      current.map((line) => (line.clientKey === clientKey ? { ...line, ...patch } : line)),
    )
  }

  const addLineDocRef = (clientKey: string) => {
    const pending = linePendingDocByKey[clientKey]
    if (!pending?.attachmentId) return
    setLines((current) =>
      current.map((line) => {
        if (line.clientKey !== clientKey) return line
        if (line.documentRefs.some((ref) => ref.attachmentId === pending.attachmentId)) return line
        const trimmed = pending.versionLabel.trim()
        return {
          ...line,
          documentRefs: [
            ...line.documentRefs,
            { attachmentId: pending.attachmentId, ...(trimmed ? { versionLabel: trimmed } : {}) },
          ],
        }
      }),
    )
    setLinePendingDocByKey((current) => ({
      ...current,
      [clientKey]: { attachmentId: '', versionLabel: '' },
    }))
  }

  const updateLineDocRefVersion = (clientKey: string, attachmentId: string, versionLabel: string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.clientKey !== clientKey) return line
        return {
          ...line,
          documentRefs: line.documentRefs.map((ref) =>
            ref.attachmentId === attachmentId
              ? { attachmentId, ...(versionLabel.trim() ? { versionLabel: versionLabel.trim() } : {}) }
              : ref,
          ),
        }
      }),
    )
  }

  const removeLineDocRef = (clientKey: string, attachmentId: string) => {
    setLines((current) =>
      current.map((line) =>
        line.clientKey === clientKey
          ? { ...line, documentRefs: line.documentRefs.filter((ref) => ref.attachmentId !== attachmentId) }
          : line,
      ),
    )
  }

  const valid = Boolean(
    draft.title.trim() &&
      draft.quantity > 0 &&
      draft.unit.trim() &&
      lines.every((line) => line.materialId && line.quantity > 0 && line.unit.trim()),
  )

  return (
    <ModalDialog
      title={editingTask ? `编辑协同任务 · ${editingTask.taskNo}` : '新建协同任务草稿'}
      description={
        editingTask
          ? `当前乐观锁版本 Rev.${editingTask.revision} · 保存将整体更新草稿字段与任务 BOM 明细，保留既有执行进度和已发布历史。`
          : '关联已有销售订单、生产订单、负责人或外协供应商，配置任务专属 BOM 与多份加工图纸版本。'
      }
      onClose={onClose}
      closeDisabled={busy}
      size="wide"
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() =>
            onSubmit({
              ...draft,
              title: draft.title.trim(),
              unit: draft.unit.trim(),
              lines: lines.map(({ clientKey: _ck, ...rest }) => ({
                ...(rest.id ? { id: rest.id } : {}),
                materialId: rest.materialId,
                quantity: rest.quantity,
                unit: rest.unit.trim(),
                note: rest.note || null,
                documentRefs: rest.documentRefs.map((ref) => ({
                  attachmentId: ref.attachmentId,
                  ...(ref.versionLabel && ref.versionLabel.trim() ? { versionLabel: ref.versionLabel.trim() } : {}),
                })),
              })),
            })
          }
          confirmLabel={editingTask ? '保存修改' : '保存任务草稿'}
          busy={busy}
          disabled={!valid}
        />
      )}
    >
      <div className="space-y-6 text-sm">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {!editingTask && templateCandidates.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5">
            <FormField
              label="从既有任务模板复用固定要求（可选）"
              hint="仅复制工艺说明、任务 BOM 物料明细和图纸引用，不复制历史实绩、进度或发布记录。"
            >
              <SearchableSelect
                value={selectedTemplateId}
                onChange={applyTemplate}
                allowClear
                options={templateCandidates.map((item) => ({
                  value: item.id,
                  label: `${item.taskNo} · ${item.title}（${item.lines.length} 项 BOM）`,
                  keywords: `${item.taskNo} ${item.title}`,
                }))}
                placeholder="输入任务单号或标题选择复用模板"
              />
            </FormField>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="任务标题" required className="sm:col-span-2">
            <input
              type="text"
              maxLength={200}
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="例如：主动轴组件精车与外协热处理协同任务"
              className={appInputClassName}
            />
          </FormField>

          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
            <NumberInputField
              label="计划数量 *"
              min={0.000001}
              value={draft.quantity}
              onChange={(quantity) => setDraft((current) => ({ ...current, quantity }))}
            />
            <FormField label="单位" required>
              <input
                type="text"
                maxLength={30}
                value={draft.unit}
                onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))}
                placeholder="件/套"
                className={appInputClassName}
              />
            </FormField>
          </div>

          <FormField label="关联生产订单（可选）" hint="关联后执行进度由 MES 生产实绩自动投影">
            <SearchableSelect
              value={draft.productionOrderId || ''}
              onChange={(val) => setDraft((current) => ({ ...current, productionOrderId: val || null }))}
              onSearch={permissions.canReadOrders ? (kw) => onSearchOptions?.('orders', kw) : undefined}
              allowClear
              disabled={!permissions.canReadOrders}
              options={orderOptions.map((item) => ({ value: item.id, label: item.label }))}
              placeholder="输入生产订单号或目标物料筛选"
            />
          </FormField>

          <FormField label="关联销售订单（可选）">
            <SearchableSelect
              value={draft.salesOrderId || ''}
              onChange={(val) => setDraft((current) => ({ ...current, salesOrderId: val || null }))}
              onSearch={permissions.canReadSalesOrders ? (kw) => onSearchOptions?.('salesOrders', kw) : undefined}
              allowClear
              disabled={!permissions.canReadSalesOrders}
              options={salesOrderOptions.map((item) => ({ value: item.id, label: item.label }))}
              placeholder="输入销售订单号或客户名称筛选"
            />
          </FormField>

          <FormField label="工作中心（可选）">
            <SearchableSelect
              value={draft.workCenterId || ''}
              onChange={(val) => setDraft((current) => ({ ...current, workCenterId: val || null }))}
              onSearch={permissions.canReadWorkCenters ? (kw) => onSearchOptions?.('workCenters', kw) : undefined}
              allowClear
              disabled={!permissions.canReadWorkCenters}
              options={workCenterOptions.map((item) => ({ value: item.id, label: item.label }))}
              placeholder="选择所属工作中心"
            />
          </FormField>

          <FormField label="内部负责人（员工）">
            <SearchableSelect
              value={draft.assigneeEmployeeId || ''}
              onChange={(val) => setDraft((current) => ({ ...current, assigneeEmployeeId: val || null }))}
              onSearch={permissions.canReadEmployees ? (kw) => onSearchOptions?.('employees', kw) : undefined}
              allowClear
              disabled={!permissions.canReadEmployees}
              options={employeeOptions.map((item) => ({ value: item.id, label: item.label }))}
              placeholder="输入员工工号、姓名或部门筛选"
            />
          </FormField>

          <FormField label="外协供应商（可选）" hint="仅建立任务协同引用，不另建独立联系人主数据">
            <SearchableSelect
              value={draft.supplierId || ''}
              onChange={(val) => setDraft((current) => ({ ...current, supplierId: val || null }))}
              onSearch={permissions.canReadSuppliers ? (kw) => onSearchOptions?.('suppliers', kw) : undefined}
              allowClear
              disabled={!permissions.canReadSuppliers}
              options={supplierOptions.map((item) => ({ value: item.id, label: item.label }))}
              placeholder="输入供应商名称或编码筛选"
            />
          </FormField>

          <FormField label="要求交期（本地时区，可选）">
            <input
              type="datetime-local"
              value={formatIsoToLocalDateTimeInput(draft.dueAt)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueAt: localDateTimeInputToIso(event.target.value),
                }))
              }
              className={appInputClassName}
            />
          </FormField>
        </section>

        <FormField label="加工与协同作业说明">
          <textarea
            rows={3}
            maxLength={10000}
            value={draft.instructions || ''}
            onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
            placeholder="填写本任务特殊公差、表面处理、包装防护、检验抽样或外协交付要求…"
            className={appTextareaClassName}
          />
        </FormField>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <OneToManyRelationField
            title="任务 BOM 明细（引用现有物料主数据，支持每行绑定多份图纸版本）"
            items={lines}
            getKey={(line) => line.clientKey}
            selector={(
              <SearchableSelect
                value={addingMaterialId}
                onChange={addBomLine}
                onSearch={permissions.canReadMaterials ? (kw) => onSearchOptions?.('materials', kw) : undefined}
                disabled={!permissions.canReadMaterials}
                options={materialOptions.map((item) => ({
                  value: item.id,
                  label: item.label,
                  keywords: `${item.code || ''} ${item.name || ''} ${item.spec || ''}`,
                }))}
                placeholder="搜索物料编码、名称或规格，选择后立即加入任务 BOM 明细"
              />
            )}
            emptyText="尚未添加任务 BOM 物料明细"
            onRemove={(line) => setLines((current) => current.filter((item) => item.clientKey !== line.clientKey))}
            renderIdentity={(line) => {
              const mat = materialOptions.find((item) => item.id === line.materialId)
              const unitCandidates = Array.from(
                new Set([line.unit, mat?.unit, mat?.stockUnit, mat?.valuationUnit].filter(Boolean) as string[]),
              )
              const pendingDoc = linePendingDocByKey[line.clientKey] || { attachmentId: '', versionLabel: '' }
              return (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(12rem,1.4fr)_7.5rem_6rem_minmax(10rem,1.2fr)]">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{mat?.label || line.materialId}</div>
                      <div className="font-mono text-xs text-blue-700">{mat?.code || line.materialId}</div>
                    </div>
                    <input
                      type="number"
                      min={0.000001}
                      step="any"
                      aria-label={`${mat?.label || line.materialId}数量`}
                      value={line.quantity || ''}
                      onChange={(e) =>
                        updateBomLine(line.clientKey, { quantity: Math.max(0, Number(e.target.value)) })
                      }
                      className={appInputClassName}
                    />
                    <select
                      aria-label={`${mat?.label || line.materialId}单位`}
                      value={line.unit}
                      onChange={(e) => updateBomLine(line.clientKey, { unit: e.target.value })}
                      className={appInputClassName}
                    >
                      {unitCandidates.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      maxLength={2000}
                      value={line.note || ''}
                      onChange={(e) => updateBomLine(line.clientKey, { note: e.target.value })}
                      placeholder="行加工说明，如：热处理 HRC48-52"
                      className={appInputClassName}
                    />
                  </div>

                  <TaskBomDocumentReferences
                    documentRefs={line.documentRefs}
                    pending={pendingDoc}
                    fileOptions={fileOptions}
                    canReadAttachments={permissions.canReadAttachments}
                    onSearchFiles={(kw) => onSearchOptions?.('files', kw)}
                    onPendingChange={(pending) =>
                      setLinePendingDocByKey((current) => ({ ...current, [line.clientKey]: pending }))
                    }
                    onUpdateVersion={(attachmentId, versionLabel) =>
                      updateLineDocRefVersion(line.clientKey, attachmentId, versionLabel)
                    }
                    onRemove={(attachmentId) => removeLineDocRef(line.clientKey, attachmentId)}
                    onAdd={() => addLineDocRef(line.clientKey)}
                  />
                </div>
              )
            }}
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <OneToManyRelationField
            title="任务级关联图纸与指导书引用（可选）"
            items={draft.documentRefs}
            getKey={(ref) => ref.attachmentId}
            selector={(
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <SearchableSelect
                  value={newDocAttachmentId}
                  onChange={setNewDocAttachmentId}
                  onSearch={permissions.canReadAttachments ? (kw) => onSearchOptions?.('files', kw) : undefined}
                  disabled={!permissions.canReadAttachments}
                  options={fileOptions.map((f) => ({ value: f.id, label: f.label || f.originalName || f.id }))}
                  placeholder="选择已授权的工程图纸或任务附件"
                />
                <input
                  type="text"
                  value={newDocVersionLabel}
                  onChange={(event) => setNewDocVersionLabel(event.target.value)}
                  placeholder="业务版本（选填）"
                  className={appInputClassName}
                />
                <AppButton variant="secondary" onClick={addTaskDocRef} disabled={!newDocAttachmentId}>
                  添加图纸引用
                </AppButton>
              </div>
            )}
            emptyText="尚未绑定任务级主图纸引用"
            onRemove={(ref) =>
              setDraft((current) => ({
                ...current,
                documentRefs: current.documentRefs.filter((item) => item.attachmentId !== ref.attachmentId),
              }))
            }
            renderIdentity={(ref) => {
              const matched = fileOptions.find((f) => f.id === ref.attachmentId)
              return (
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <span className="truncate text-xs font-medium text-gray-900">
                    {matched?.label || matched?.originalName || ref.attachmentId}
                  </span>
                  <input
                    type="text"
                    value={ref.versionLabel || ''}
                    onChange={(e) => updateTaskDocRefVersion(ref.attachmentId, e.target.value)}
                    placeholder="业务版本（选填）"
                    className="h-8 rounded border border-gray-200 px-2 text-xs"
                  />
                </div>
              )
            }}
          />
        </div>
      </div>
    </ModalDialog>
  )
}
