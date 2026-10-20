'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistedDisplayMode } from '@/app/components/ViewModeToggle'
import {
  TaskCollaborationApiError,
  appendTaskProgress,
  archiveTask,
  assignTask,
  createOperationId,
  createTaskDraft,
  downloadTaskReleaseManifest,
  getTaskDetail,
  listTasks,
  previewTaskRelease,
  publishTaskRelease,
  recordTaskDelivery,
  restoreTask,
  updateTaskDraft,
} from '../client/task-collaboration-api'
import type {
  PermissionMap,
  TaskCollaborationStatus,
  TaskDraftInput,
  TaskPagination,
  TaskRecipient,
  TaskRecord,
  TaskReleasePreviewResponse,
  TaskReleaseRecord,
} from '../contracts/task-collaboration'
import {
  createEmptyTaskDraft,
  draftFromTaskRecord,
  resolveTaskPermissions,
} from '../model/task-collaboration-view'
import { TaskAssignModal, TaskProgressModal } from './TaskAssignAndProgressModal'
import { buildTaskCollaborationColumns } from './TaskCollaborationCollectionView'
import {
  TaskCollaborationAccessDenied,
  TaskCollaborationCollectionPanel,
  TaskCollaborationSelectedDetailPanel,
} from './TaskCollaborationPagePanels'
import TaskDraftDialog from './TaskDraftDialog'
import { TaskDeliveryRecordModal, TaskReleasePublishModal } from './TaskReleasePublishModal'
import { useTaskOptionCatalog } from './useTaskOptionCatalog'

export interface TaskCollaborationPageProps {
  permissions?: PermissionMap
  onNotice?: (message: string) => void
}

const displayModes = ['list', 'card', 'columns'] as const

export default function TaskCollaborationPage({
  permissions: rawPermissions,
  onNotice,
}: TaskCollaborationPageProps) {
  const permissions = useMemo(() => resolveTaskPermissions(rawPermissions), [rawPermissions])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskCollaborationStatus | ''>('')
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<TaskPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  })
  const [viewMode, setViewMode] = usePersistedDisplayMode(
    'mes-lite.resource.taskCollaboration.display-mode.v1',
    'list',
    displayModes,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [permissionDeniedError, setPermissionDeniedError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [archivingTaskId, setArchivingTaskId] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const [draftOpen, setDraftOpen] = useState(false)
  const [draftSessionNonce, setDraftSessionNonce] = useState(0)
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null)
  const [draftInitial, setDraftInitial] = useState<TaskDraftInput>(createEmptyTaskDraft)

  const [assignOpen, setAssignOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [releasePreview, setReleasePreview] = useState<TaskReleasePreviewResponse | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [deliveryModalRelease, setDeliveryModalRelease] = useState<TaskReleaseRecord | null>(null)

  const {
    materialOptions,
    employeeOptions,
    supplierOptions,
    orderOptions,
    salesOrderOptions,
    dispatchOptions,
    workCenterOptions,
    fileOptions,
    searchOptionsByType,
    primeOptionsForTask,
  } = useTaskOptionCatalog(permissions)

  const abortRef = useRef<AbortController | null>(null)
  const exportOperationIdByReleaseRef = useRef<Record<string, string>>({})

  const notify = useCallback(
    (msg: string) => {
      onNotice?.(msg)
    },
    [onNotice],
  )

  const handleKeywordChange = useCallback((nextKeyword: string) => {
    setKeyword(nextKeyword)
    setPage(1)
  }, [])

  const handleStatusFilterChange = useCallback((nextStatus: TaskCollaborationStatus | '') => {
    setStatusFilter(nextStatus)
    setPage(1)
  }, [])

  const handleToggleArchived = useCallback(() => {
    setShowArchived((current) => !current)
    setSelectedId(null)
    setPage(1)
  }, [])

  const loadTaskList = useCallback(async () => {
    if (!permissions.canRead) {
      setLoading(false)
      setPermissionDeniedError('当前账号缺少“任务协同读取 (taskCollaboration.canRead)”权限，请联系系统管理员授权。')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setPermissionDeniedError(null)
    try {
      const response = await listTasks({
        keyword,
        status: statusFilter,
        archived: showArchived,
        page,
        pageSize,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const nextItems = response.data || []
      setTasks(nextItems)
      setPagination(response.pagination)
      if (response.pagination.total > 0 && page > response.pagination.totalPages) {
        setPage(response.pagination.totalPages)
      }
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) return current
        return nextItems[0]?.id || null
      })
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof TaskCollaborationApiError && (err.status === 401 || err.status === 403)) {
        setPermissionDeniedError(err.message)
      } else {
        setError(err instanceof Error ? err.message : '加载任务协同列表失败')
      }
      setTasks([])
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [keyword, page, pageSize, permissions.canRead, showArchived, statusFilter])

  useEffect(() => {
    void loadTaskList()
    return () => abortRef.current?.abort()
  }, [loadTaskList])

  const refreshSelectedTask = useCallback(
    async (id: string) => {
      try {
        const fresh = await getTaskDetail(id)
        setTasks((current) => current.map((item) => (item.id === id ? fresh : item)))
        return fresh
      } catch (err) {
        notify(err instanceof Error ? err.message : '刷新任务详情失败')
        return null
      }
    },
    [notify],
  )

  const selectedTask = useMemo(
    () => tasks.find((item) => item.id === selectedId) || null,
    [selectedId, tasks],
  )

  const columns = useMemo(
    () =>
      buildTaskCollaborationColumns(permissions, notify, {
        showArchived,
        archivingTaskId,
      }),
    [archivingTaskId, notify, permissions, showArchived],
  )

  if (!permissions.canRead || permissionDeniedError) {
    return (
      <TaskCollaborationAccessDenied
        error={permissionDeniedError}
        onRetry={() => void loadTaskList()}
      />
    )
  }

  const openCreateDialog = async () => {
    setEditingTask(null)
    setDraftInitial(createEmptyTaskDraft())
    setDraftSessionNonce((n) => n + 1)
    setModalError(null)
    setDraftOpen(true)
    await primeOptionsForTask(null)
  }

  const openEditDialog = async (task: TaskRecord) => {
    const fresh = (await refreshSelectedTask(task.id)) || task
    setEditingTask(fresh)
    setDraftInitial(draftFromTaskRecord(fresh, false))
    setDraftSessionNonce((n) => n + 1)
    setModalError(null)
    setDraftOpen(true)
    await primeOptionsForTask(fresh)
  }

  const handleSaveDraft = async (draft: TaskDraftInput) => {
    setActionBusy(true)
    setModalError(null)
    try {
      if (editingTask) {
        const { templateTaskId: _unused, ...patchBody } = draft
        const updated = await updateTaskDraft(editingTask.id, {
          ...patchBody,
          expectedRevision: editingTask.revision,
        })
        setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        notify(`任务 ${updated.taskNo} 已更新（Rev.${updated.revision}）`)
      } else {
        const created = await createTaskDraft(draft)
        setDraftOpen(false)
        setPage(1)
        setSelectedId(created.id)
        notify(`任务草稿已创建：${created.taskNo}`)
        await loadTaskList()
        return
      }
      setDraftOpen(false)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '保存任务失败')
    } finally {
      setActionBusy(false)
    }
  }

  const detailNode = selectedTask ? (
    <TaskCollaborationSelectedDetailPanel
      tasks={tasks}
      pagination={pagination}
      onSelect={setSelectedId}
      onClose={() => setSelectedId(null)}
      task={selectedTask}
      permissions={permissions}
      busy={actionBusy}
      archiving={showArchived || archivingTaskId === selectedTask.id}
      onNotice={notify}
      onOpenEdit={() => void openEditDialog(selectedTask)}
      onOpenAssign={async () => {
        setModalError(null)
        setAssignOpen(true)
        await primeOptionsForTask(selectedTask)
      }}
      onOpenProgress={async () => {
        setModalError(null)
        setProgressOpen(true)
        await primeOptionsForTask(selectedTask)
      }}
      onOpenReleasePreview={() => {
        setModalError(null)
        setReleasePreview(null)
        setReleaseModalOpen(true)
      }}
      onOpenRecordDelivery={(release) => {
        setModalError(null)
        setDeliveryModalRelease(release)
      }}
      onExportReleaseManifest={async (release) => {
        setActionBusy(true)
        const opKey = `${selectedTask.id}:${release.id}`
        if (!exportOperationIdByReleaseRef.current[opKey]) {
          exportOperationIdByReleaseRef.current[opKey] = createOperationId('export')
        }
        try {
          const manifest = await downloadTaskReleaseManifest(selectedTask.id, release.id)
          const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `${selectedTask.taskNo}-Rev${release.revision}-manifest.json`
          anchor.click()
          URL.revokeObjectURL(url)
          if (permissions.canPublish && !selectedTask.deletedAt && !showArchived) {
            await recordTaskDelivery(selectedTask.id, release.id, {
              operationId: exportOperationIdByReleaseRef.current[opKey],
              method: 'EXPORT',
              status: 'EXPORTED',
              note: '前端导出不可变发布资料包 JSON 清单',
            })
            delete exportOperationIdByReleaseRef.current[opKey]
            await refreshSelectedTask(selectedTask.id)
          }
          notify(`已导出发布清单 Rev.${release.revision}`)
        } catch (err) {
          notify(err instanceof Error ? err.message : '导出发布资料清单失败')
        } finally {
          setActionBusy(false)
        }
      }}
      onArchive={async () => {
        const targetId = selectedTask.id
        const targetNo = selectedTask.taskNo
        const targetRevision = selectedTask.revision
        if (!window.confirm(`确定归档协同任务 ${targetNo} 吗？归档后可从归档视图恢复。`)) return
        setActionBusy(true)
        setArchivingTaskId(targetId)
        try {
          const archivedTask = await archiveTask(targetId, targetRevision)
          if (!showArchived) {
            setTasks((current) => current.filter((item) => item.id !== targetId))
            setSelectedId((current) => (current === targetId ? null : current))
          } else {
            setTasks((current) =>
              current.map((item) => (item.id === targetId ? archivedTask : item)),
            )
          }
          notify(`任务 ${targetNo} 已归档`)
          await loadTaskList()
        } catch (err) {
          notify(err instanceof Error ? err.message : '归档任务失败')
        } finally {
          setArchivingTaskId(null)
          setActionBusy(false)
        }
      }}
      onRestore={async () => {
        setActionBusy(true)
        try {
          await restoreTask(selectedTask.id, selectedTask.revision)
          notify(`任务 ${selectedTask.taskNo} 已恢复`)
          await loadTaskList()
        } catch (err) {
          notify(err instanceof Error ? err.message : '恢复归档任务失败')
        } finally {
          setActionBusy(false)
        }
      }}
    />
  ) : undefined

  const draftSessionKey = `${editingTask?.id || 'create'}:${editingTask?.revision || 0}:${draftSessionNonce}`

  return (
    <div className="space-y-3">
      <TaskCollaborationCollectionPanel
        tasks={tasks}
        columns={columns}
        selectedId={selectedId}
        detail={detailNode}
        loading={loading}
        error={error}
        keyword={keyword}
        statusFilter={statusFilter}
        showArchived={showArchived}
        canCreate={permissions.canCreate}
        viewMode={viewMode}
        displayModes={displayModes}
        pagination={pagination}
        page={page}
        pageSize={pageSize}
        onSelect={setSelectedId}
        onRetry={() => void loadTaskList()}
        onKeywordChange={handleKeywordChange}
        onStatusFilterChange={handleStatusFilterChange}
        onToggleArchived={handleToggleArchived}
        onCreate={() => void openCreateDialog()}
        onClearFilters={() => {
          setKeyword('')
          setStatusFilter('')
          setPage(1)
        }}
        onViewModeChange={setViewMode}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(1)
        }}
      />

      <TaskDraftDialog
        key={draftSessionKey}
        open={draftOpen}
        sessionKey={draftSessionKey}
        editingTask={editingTask}
        initialDraft={draftInitial}
        templateCandidates={tasks}
        materialOptions={materialOptions}
        employeeOptions={employeeOptions}
        supplierOptions={supplierOptions}
        orderOptions={orderOptions}
        salesOrderOptions={salesOrderOptions}
        workCenterOptions={workCenterOptions}
        fileOptions={fileOptions}
        onSearchOptions={(type, kw) => searchOptionsByType(type, kw, editingTask?.id)}
        permissions={permissions}
        busy={actionBusy}
        error={modalError}
        onClose={() => setDraftOpen(false)}
        onSubmit={(draft) => void handleSaveDraft(draft)}
      />

      {assignOpen && selectedTask && (
        <TaskAssignModal
          task={selectedTask}
          dispatches={dispatchOptions}
          canReadDispatches={permissions.canReadDispatches}
          onSearchDispatches={(kw) => searchOptionsByType('dispatches', kw, selectedTask.id)}
          busy={actionBusy}
          error={modalError}
          onClose={() => setAssignOpen(false)}
          onConfirm={async (dispatchId) => {
            setActionBusy(true)
            setModalError(null)
            try {
              const updated = await assignTask(selectedTask.id, {
                expectedRevision: selectedTask.revision,
                dispatchId,
              })
              setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
              setAssignOpen(false)
              notify(`任务 ${updated.taskNo} 已派工`)
            } catch (err) {
              setModalError(err instanceof Error ? err.message : '派工失败')
            } finally {
              setActionBusy(false)
            }
          }}
        />
      )}

      {progressOpen && selectedTask && (
        <TaskProgressModal
          task={selectedTask}
          fileOptions={fileOptions}
          canReadFiles={permissions.canReadAttachments}
          onSearchFiles={(kw) => searchOptionsByType('files', kw, selectedTask.id)}
          busy={actionBusy}
          error={modalError}
          onClose={() => setProgressOpen(false)}
          onSubmit={async (input) => {
            setActionBusy(true)
            setModalError(null)
            try {
              const updated = await appendTaskProgress(selectedTask.id, input)
              setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
              setProgressOpen(false)
              notify('已登记任务进度记录')
            } catch (err) {
              setModalError(err instanceof Error ? err.message : '登记进度失败')
            } finally {
              setActionBusy(false)
            }
          }}
        />
      )}

      {releaseModalOpen && selectedTask && (
        <TaskReleasePublishModal
          task={selectedTask}
          preview={releasePreview}
          previewBusy={previewBusy}
          publishBusy={actionBusy}
          error={modalError}
          onClose={() => setReleaseModalOpen(false)}
          onInvalidatePreview={() => setReleasePreview(null)}
          onRequestPreview={async (recipient: TaskRecipient) => {
            setPreviewBusy(true)
            setModalError(null)
            try {
              const result = await previewTaskRelease(selectedTask.id, {
                expectedRevision: selectedTask.revision,
                recipient,
              })
              setReleasePreview(result)
            } catch (err) {
              setModalError(err instanceof Error ? err.message : '生成发布预览失败')
            } finally {
              setPreviewBusy(false)
            }
          }}
          onConfirmPublish={async (recipient: TaskRecipient, previewToken: string, operationId: string) => {
            setActionBusy(true)
            setModalError(null)
            try {
              await publishTaskRelease(selectedTask.id, {
                expectedRevision: selectedTask.revision,
                operationId,
                recipient,
                previewToken,
              })
              await refreshSelectedTask(selectedTask.id)
              setReleaseModalOpen(false)
              setReleasePreview(null)
              notify(`任务 ${selectedTask.taskNo} 已生成不可变发布资料包`)
            } catch (err) {
              setModalError(err instanceof Error ? err.message : '正式发布失败')
            } finally {
              setActionBusy(false)
            }
          }}
        />
      )}

      {deliveryModalRelease && selectedTask && (
        <TaskDeliveryRecordModal
          task={selectedTask}
          release={deliveryModalRelease}
          busy={actionBusy}
          error={modalError}
          onClose={() => setDeliveryModalRelease(null)}
          onSubmit={async (input) => {
            setActionBusy(true)
            setModalError(null)
            try {
              await recordTaskDelivery(selectedTask.id, deliveryModalRelease.id, input)
              await refreshSelectedTask(selectedTask.id)
              setDeliveryModalRelease(null)
              notify('发放记录已登记')
            } catch (err) {
              setModalError(err instanceof Error ? err.message : '登记发放记录失败')
            } finally {
              setActionBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}
