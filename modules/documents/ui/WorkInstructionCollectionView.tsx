'use client'

import type { ReactNode } from 'react'
import { DocumentPreviewThumb } from '@/modules/attachments'
import SortableTableHeader, { type TableSortDirection } from '@/app/components/SortableTableHeader'
import AppButton from '@/app/components/AppButton'
import type { PaginationState, WorkInstruction } from '../contracts/work-instruction'
import {
  getInstructionCategoryLabel,
  getInstructionCustomerName,
  getInstructionScopeLabel,
  statusLabels,
} from '../model/work-instruction-view'

function Pagination({
  pagination,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationState
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const totalPages = Math.max(1, pagination.totalPages || 1)
  const currentPage = Math.min(Math.max(1, pagination.page || 1), totalPages)
  const start = pagination.total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(pagination.total, currentPage * pageSize)

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="whitespace-nowrap">共 {pagination.total} 条，当前 {start}-{end} 条，第 {currentPage}/{totalPages} 页</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
          <option value={20}>20 条/页</option>
          <option value={50}>50 条/页</option>
          <option value={100}>100 条/页</option>
        </select>
        {[
          ['首页', 1, currentPage <= 1],
          ['上一页', currentPage - 1, currentPage <= 1],
          ['下一页', currentPage + 1, currentPage >= totalPages],
          ['末页', totalPages, currentPage >= totalPages],
        ].map(([label, nextPage, disabled]) => (
          <button key={String(label)} type="button" onClick={() => onPageChange(Number(nextPage))} disabled={Boolean(disabled)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function InstructionBadge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone]
  return <span className={`rounded px-2 py-1 text-xs font-medium ${toneClass}`}>{children}</span>
}

interface WorkInstructionCollectionViewProps {
  items: WorkInstruction[]
  viewMode: string
  sortColumn: string
  sortDirection: TableSortDirection
  onSort: (column: string) => void
  pagination: PaginationState
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onCreate: () => void
  onOpenPreview: (instruction: WorkInstruction) => void
  onOpenDetail: (instruction: WorkInstruction) => void
  onArchive: (instruction: WorkInstruction) => void
}

export default function WorkInstructionCollectionView({
  items,
  viewMode,
  sortColumn,
  sortDirection,
  onSort,
  pagination,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onCreate,
  onOpenPreview,
  onOpenDetail,
  onArchive,
}: WorkInstructionCollectionViewProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-white py-10 text-center text-gray-500 shadow sm:bg-transparent sm:py-12 sm:shadow-none">
        <p>暂无文档</p>
        <AppButton variant="create" onClick={onCreate} className="mt-4">新建第一篇文档</AppButton>
      </div>
    )
  }

  if (viewMode === 'card') {
    return (
      <>
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((instruction) => (
            <article key={instruction.id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:shadow-none">
              <button type="button" onClick={() => onOpenPreview(instruction)} aria-label={`全屏预览 ${instruction.title}`} className="text-left">
                <DocumentPreviewThumb attachment={instruction.primaryAttachment} title={instruction.title} className="!aspect-auto h-[clamp(12rem,28vw,18rem)]" />
              </button>
              <div className="mt-3 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <InstructionBadge tone="blue">{instruction.material?.code || '通用'}</InstructionBadge>
                  <InstructionBadge>{getInstructionCategoryLabel(instruction)}</InstructionBadge>
                  <InstructionBadge tone={instruction.status === 'ACTIVE' ? 'green' : instruction.status === 'DRAFT' ? 'amber' : 'gray'}>
                    {statusLabels[instruction.status] || instruction.status}
                  </InstructionBadge>
                </div>
                <h3 className="mt-2 line-clamp-2 text-base font-semibold text-gray-900">{instruction.title}</h3>
                <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                  <div className="truncate">版本：{instruction.version || '-'}</div>
                  <div className="truncate">产品：{instruction.material ? instruction.material.name : '未绑定'}</div>
                  {instruction.material?.spec && <div className="truncate">规格：{instruction.material.spec}</div>}
                  <div className="truncate">客户：{getInstructionCustomerName(instruction)}</div>
                  <div className="line-clamp-2">工作中心：{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div>
                  <div>内容：{instruction.contentText ? '在线正文' : '无正文'} · {instruction.attachmentCount} 个附件</div>
                  {instruction.note && <div className="line-clamp-2">备注：{instruction.note}</div>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => onOpenPreview(instruction)} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700">全屏预览</button>
                <button type="button" onClick={() => onOpenDetail(instruction)} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50">详情</button>
                <button type="button" onClick={() => onArchive(instruction)} className="rounded border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50">归档</button>
              </div>
            </article>
          ))}
        </div>
        <Pagination pagination={pagination} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      </>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full min-w-[1080px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-24 px-4 py-3 text-left text-sm font-semibold text-gray-600">预览</th>
              <SortableTableHeader column="code" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} className="w-44">关联产品</SortableTableHeader>
              <SortableTableHeader column="name" activeColumn={sortColumn} direction={sortDirection} onSort={onSort}>文档标题</SortableTableHeader>
              <SortableTableHeader column="category" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} className="w-28">文档类别</SortableTableHeader>
              <SortableTableHeader column="status" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} className="w-24">状态</SortableTableHeader>
              <SortableTableHeader column="customer" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} className="w-36">客户</SortableTableHeader>
              <SortableTableHeader column="workCenters" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} className="w-40">工作中心</SortableTableHeader>
              <SortableTableHeader column="files" activeColumn={sortColumn} direction={sortDirection} onSort={onSort} className="w-28">文件</SortableTableHeader>
              <th className="w-56 px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((instruction) => (
              <tr key={instruction.id} className="align-top hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpenPreview(instruction)} aria-label={`全屏预览 ${instruction.title}`} className="block h-14 w-20 overflow-hidden rounded">
                    <DocumentPreviewThumb attachment={instruction.primaryAttachment} title={instruction.title} />
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-blue-700">{getInstructionScopeLabel(instruction)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{instruction.title}</div>
                  <div className="mt-1 text-xs text-gray-500">{instruction.version || '-'}</div>
                  {instruction.note && <div className="mt-1 line-clamp-2 text-xs text-gray-500">备注：{instruction.note}</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{getInstructionCategoryLabel(instruction)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{statusLabels[instruction.status] || instruction.status}</td>
                <td className="px-4 py-3 text-sm">{getInstructionCustomerName(instruction)}</td>
                <td className="px-4 py-3 text-sm"><div className="line-clamp-2">{instruction.workCenters.length > 0 ? instruction.workCenters.map((item) => item.name).join('、') : '不限'}</div></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{instruction.contentText ? '在线 · ' : ''}{instruction.attachmentCount} 个附件</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => onOpenPreview(instruction)} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">全屏预览</button>
                    <button onClick={() => onOpenDetail(instruction)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">详情</button>
                    <button onClick={() => onArchive(instruction)} className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">归档</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
    </>
  )
}
