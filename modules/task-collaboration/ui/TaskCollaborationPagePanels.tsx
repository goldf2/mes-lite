'use client'

import type { ComponentProps, ReactNode } from 'react'
import AppButton from '@/app/components/AppButton'
import { appSelectClassName } from '@/app/components/FormField'
import { ResourceDetailPanel, ResourcePage, type ResourceTableColumn } from '@/app/components/resource'
import type { TaskCollaborationStatus, TaskPagination, TaskRecord } from '../contracts/task-collaboration'
import {
  isTaskEditableStatus,
  taskExecutionSourceLabels,
  taskStatusBadgeClasses,
  taskStatusLabels,
} from '../model/task-collaboration-view'
import { TaskCollaborationCardItem, TaskCollaborationPaginationFooter } from './TaskCollaborationCollectionView'
import TaskDetailWorkspace from './TaskDetailWorkspace'

export function TaskCollaborationAccessDenied({ error, onRetry }: {
  error: string | null
  onRetry: () => void
}) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900 shadow-sm"
    >
      <h2 className="text-base font-semibold">无任务协同访问权限</h2>
      <p className="mt-1.5 text-xs text-amber-800">
        {error ||
          '当前账号未开通 taskCollaboration.canRead 权限，或超出生产数据范围（SELF / WORK_CENTERS）。'}
      </p>
      <div className="mt-4 flex justify-center">
        <AppButton size="sm" variant="secondary" onClick={onRetry}>
          重新检查权限
        </AppButton>
      </div>
    </section>
  )
}

export function TaskCollaborationSelectedDetailPanel({
  tasks, pagination, onSelect, onClose, ...workspaceProps
}: ComponentProps<typeof TaskDetailWorkspace> & {
  tasks: TaskRecord[]
  pagination: TaskPagination
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { task, permissions, archiving } = workspaceProps
  const selectedPosition = tasks.findIndex((item) => item.id === task.id)
  return (
    <ResourceDetailPanel
      title={task.title}
      subtitle={`${task.taskNo} · Rev.${task.revision} · ${taskExecutionSourceLabels[task.execution.source]}`}
      status={
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${taskStatusBadgeClasses[task.status]}`}>
          {taskStatusLabels[task.status]}
        </span>
      }
      position={selectedPosition >= 0 ? (pagination.page - 1) * pagination.pageSize + selectedPosition + 1 : undefined}
      total={pagination.total}
      onPrevious={selectedPosition > 0 ? () => onSelect(tasks[selectedPosition - 1].id) : undefined}
      onNext={
        selectedPosition >= 0 && selectedPosition < tasks.length - 1
          ? () => onSelect(tasks[selectedPosition + 1].id)
          : undefined
      }
      onEdit={
        isTaskEditableStatus(task.status, Boolean(task.deletedAt) || Boolean(archiving)) && permissions.canUpdate
          ? workspaceProps.onOpenEdit
          : undefined
      }
      onClose={onClose}
    >
      <TaskDetailWorkspace {...workspaceProps} />
    </ResourceDetailPanel>
  )
}

type TaskDisplayMode = 'list' | 'card' | 'columns'

export function TaskCollaborationCollectionPanel({
  tasks, columns, selectedId, detail, loading, error, keyword, statusFilter,
  showArchived, canCreate, viewMode, displayModes, pagination, page, pageSize,
  onSelect, onRetry, onKeywordChange, onStatusFilterChange, onToggleArchived,
  onCreate, onClearFilters, onViewModeChange, onPageChange, onPageSizeChange,
}: {
  tasks: TaskRecord[]
  columns: ResourceTableColumn<TaskRecord>[]
  selectedId: string | null
  detail?: ReactNode
  loading: boolean
  error: string | null
  keyword: string
  statusFilter: TaskCollaborationStatus | ''
  showArchived: boolean
  canCreate: boolean
  viewMode: TaskDisplayMode
  displayModes: readonly TaskDisplayMode[]
  pagination: TaskPagination
  page: number
  pageSize: number
  onSelect: (id: string) => void
  onRetry: () => void
  onKeywordChange: (keyword: string) => void
  onStatusFilterChange: (status: TaskCollaborationStatus | '') => void
  onToggleArchived: () => void
  onCreate: () => void
  onClearFilters: () => void
  onViewModeChange: (mode: TaskDisplayMode) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  return (
    <>
      <ResourcePage
        resourceKey="taskCollaboration"
        title="任务协同"
        description="关联生产订单、任务专属 BOM、受控图纸版本、进度异常时间线与可追溯发布资料包"
        items={tasks}
        getKey={(item) => item.id}
        columns={columns}
        renderCard={({ item }) => <TaskCollaborationCardItem item={item} />}
        selectedKey={selectedId}
        onSelect={(item) => onSelect(item.id)}
        detail={detail}
        loading={loading}
        loadingLabel="正在加载任务协同数据…"
        error={error}
        onRetry={onRetry}
        emptyLabel={
          keyword.trim() || statusFilter
            ? '当前搜索或状态筛选条件无匹配任务'
            : showArchived
              ? '暂无已归档协同任务'
              : '尚未创建协同任务'
        }
        emptyAction={
          keyword.trim() || statusFilter ? (
            <AppButton
              size="sm"
              variant="secondary"
              onClick={onClearFilters}
            >
              清空筛选条件
            </AppButton>
          ) : !showArchived && canCreate ? (
            <AppButton size="sm" variant="create" onClick={onCreate}>
              新建
            </AppButton>
          ) : undefined
        }
        searchValue={keyword}
        onSearchChange={onKeywordChange}
        searchPlaceholder="搜索任务单号、标题、作业说明、负责人或供应商"
        advancedSearchFields={[]}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        displayModes={displayModes}
        onCreate={!showArchived && canCreate ? onCreate : undefined}
        createLabel="新建"
        actions={(
          <div className="flex items-center gap-2">
            <select
              aria-label="按任务状态筛选"
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value as TaskCollaborationStatus | '')}
              className={`${appSelectClassName} !w-auto min-w-[7.5rem]`}
            >
              <option value="">全部状态</option>
              {(Object.keys(taskStatusLabels) as TaskCollaborationStatus[]).map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {taskStatusLabels[statusKey]}
                </option>
              ))}
            </select>
            <AppButton
              variant={showArchived ? 'warning' : 'secondary'}
              onClick={onToggleArchived}
            >
              {showArchived ? '返回活动任务' : '已归档'}
            </AppButton>
          </div>
        )}
        summary={
          <span className="text-xs text-gray-500">
            共 {pagination.total} 项任务 · 第 {pagination.page}/{Math.max(1, pagination.totalPages)} 页
          </span>
        }
        rowLabel={(item) => `查看协同任务 ${item.taskNo} ${item.title}`}
      />

      <TaskCollaborationPaginationFooter
        pagination={pagination}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  )
}
