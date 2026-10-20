'use client'

import AppButton from '@/app/components/AppButton'
import type { ResourceTableColumn } from '@/app/components/resource'
import { AttachmentPanel } from '@/modules/attachments'
import type {
  ResolvedTaskPermissions,
  TaskPagination,
  TaskRecord,
} from '../contracts/task-collaboration'
import {
  formatTaskDateTime,
  formatTaskQuantity,
  taskExecutionSourceLabels,
  taskStatusBadgeClasses,
  taskStatusLabels,
} from '../model/task-collaboration-view'

export function buildTaskCollaborationColumns(
  permissions: ResolvedTaskPermissions,
  notify: (message: string) => void,
  options?: {
    showArchived?: boolean
    archivingTaskId?: string | null
  },
): ResourceTableColumn<TaskRecord>[] {
  return [
    {
      key: 'taskNo',
      label: '任务单号',
      headerClassName: 'whitespace-nowrap',
      className: 'whitespace-nowrap font-mono text-xs text-blue-700 font-semibold',
      render: (item) => (
        <div>
          <div>{item.taskNo}</div>
          <div className="text-[11px] font-normal text-gray-400">Rev.{item.revision}</div>
        </div>
      ),
    },
    {
      key: 'title',
      label: '任务标题 / 关联单据',
      headerClassName: 'min-w-[14rem] whitespace-nowrap',
      className: 'min-w-[14rem]',
      render: (item) => (
        <div className="w-56">
          <div className="truncate font-medium text-gray-900" title={item.title}>{item.title}</div>
          <div className="mt-0.5 truncate text-xs text-gray-500">
            {item.execution.productionOrder?.orderNo || item.productionOrderNo
              ? `工单 ${item.execution.productionOrder?.orderNo || item.productionOrderNo}`
              : '未绑工单'}
            {item.salesOrder?.orderNo || item.salesOrderNo
              ? ` · 销单 ${item.salesOrder?.orderNo || item.salesOrderNo}`
              : ''}
            {` · BOM ${item.lines.length} 项`}
          </div>
        </div>
      ),
    },
    {
      key: 'assignee',
      label: '派工 / 收件对象',
      hideBelow: 'md',
      headerClassName: 'min-w-[10rem] whitespace-nowrap',
      className: 'min-w-[10rem]',
      render: (item) => {
        const assigneeName = item.assigneeEmployee?.name || item.assigneeEmployeeName ||
          item.supplier?.name || item.supplierName || '待指定'
        const workCenterName = item.workCenter?.name || item.workCenterName || (item.supplierId ? '外协供应商' : '-')
        return (
          <div className="w-40 text-xs">
            <div className="truncate font-medium text-gray-900" title={assigneeName}>{assigneeName}</div>
            <div className="mt-0.5 truncate text-gray-500" title={workCenterName}>{workCenterName}</div>
          </div>
        )
      },
    },
    {
      key: 'quantity',
      label: '数量 / 实绩源',
      hideBelow: 'lg',
      headerClassName: 'min-w-[7rem] whitespace-nowrap',
      className: 'min-w-[7rem] whitespace-nowrap text-xs',
      render: (item) => (
        <div>
          <div className="font-semibold text-gray-900">{formatTaskQuantity(item.quantity, item.unit)}</div>
          <div className="text-[11px] text-gray-500">{taskExecutionSourceLabels[item.execution.source]}</div>
        </div>
      ),
    },
    {
      key: 'dueAt',
      label: '要求交期',
      hideBelow: 'xl',
      headerClassName: 'whitespace-nowrap',
      className: 'whitespace-nowrap text-xs text-gray-600',
      render: (item) => formatTaskDateTime(item.dueAt),
    },
    {
      key: 'attachments',
      label: '附件',
      hideBelow: 'lg',
      headerClassName: 'whitespace-nowrap',
      render: (item) => {
        const archived =
          Boolean(item.deletedAt) ||
          Boolean(options?.showArchived) ||
          options?.archivingTaskId === item.id
        if (archived) {
          return (
            <span className="text-xs text-amber-700" title="已归档任务暂不访问原始附件">
              已归档不可访问
            </span>
          )
        }
        if (!permissions.canReadAttachments) {
          return <span className="text-xs text-gray-400">-</span>
        }
        const canUpload = permissions.canUploadAttachments
        const canUpdate = permissions.canUpdateAttachments
        const canArchive = permissions.canDeleteAttachments
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <AttachmentPanel
              ownerType="TASK_COLLABORATION"
              ownerId={item.id}
              compact
              compactMode="summary"
              readOnly={!canUpload && !canUpdate && !canArchive}
              canUpload={canUpload}
              canUpdate={canUpdate}
              canEdit={canUpdate}
              canArchive={canArchive}
              onMessage={notify}
            />
          </div>
        )
      },
    },
    {
      key: 'status',
      label: '状态',
      headerClassName: 'whitespace-nowrap',
      className: 'whitespace-nowrap',
      render: (item) => (
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${taskStatusBadgeClasses[item.status]}`}
        >
          {taskStatusLabels[item.status]}
        </span>
      ),
    },
  ]
}

export function TaskCollaborationCardItem({ item }: { item: TaskRecord }) {
  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-blue-700">
          {item.taskNo} <span className="text-xs font-normal text-gray-400">Rev.{item.revision}</span>
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${taskStatusBadgeClasses[item.status]}`}>
          {taskStatusLabels[item.status]}
        </span>
      </div>
      <h2 className="line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</h2>
      <div className="grid grid-cols-2 gap-2 rounded bg-gray-50 p-2 text-gray-600">
        <div>
          对象：
          {item.assigneeEmployee?.name ||
            item.assigneeEmployeeName ||
            item.supplier?.name ||
            item.supplierName ||
            '待指定'}
        </div>
        <div>数量：{formatTaskQuantity(item.quantity, item.unit)}</div>
        <div>工单：{item.execution.productionOrder?.orderNo || item.productionOrderNo || '未绑工单'}</div>
        <div>交期：{formatTaskDateTime(item.dueAt)}</div>
      </div>
      <div className="flex items-center justify-between pt-1 text-gray-500">
        <span>BOM {item.lines.length} 项 · 发布 {item.releases.length} 次</span>
        <span className="font-medium text-blue-700">详情</span>
      </div>
    </div>
  )
}

export function TaskCollaborationPaginationFooter({
  pagination,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: TaskPagination
  page: number
  pageSize: number
  loading: boolean
  onPageChange: (nextPage: number) => void
  onPageSizeChange: (nextPageSize: number) => void
}) {
  if (pagination.total <= 0) return null
  return (
    <footer
      aria-label="任务协同分页导航"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-600 shadow-sm"
    >
      <div>
        共 <span className="font-semibold text-gray-900">{pagination.total}</span> 条记录 · 当前显示第{' '}
        <span className="font-mono font-semibold text-gray-900">{pagination.page}</span> /{' '}
        <span className="font-mono font-semibold text-gray-900">{Math.max(1, pagination.totalPages)}</span> 页
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5">
          <span>每页</span>
          <select
            aria-label="每页条数"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700"
          >
            <option value={20}>20 条</option>
            <option value={50}>50 条</option>
            <option value={100}>100 条</option>
          </select>
        </label>
        <AppButton
          size="sm"
          variant="secondary"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          上一页
        </AppButton>
        <AppButton
          size="sm"
          variant="secondary"
          disabled={loading || page >= pagination.totalPages}
          onClick={() => onPageChange(Math.min(pagination.totalPages, page + 1))}
        >
          下一页
        </AppButton>
      </div>
    </footer>
  )
}
