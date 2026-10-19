'use client'

import { ArrowRight, Factory, Users } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import type { AvailableBusinessApplication, BusinessApplicationKey } from '../domain/business-applications'
import {
  useWorkspaceFunctionSearch,
  useWorkspacePreferenceActions,
  WorkspaceFunctionGroups,
  WorkspaceFunctionSearch,
  type SaveWorkspacePreference,
  type WorkspaceFunctionItem,
} from './WorkspaceFunctionCatalog'

interface PlatformOverviewPageProps {
  items: WorkspaceFunctionItem[]
  applications: Array<AvailableBusinessApplication<WorkspaceFunctionItem>>
  preference: WorkspacePreferenceValue
  onOpen: (key: WorkspaceFunctionKey) => void
  onOpenApplication: (key: BusinessApplicationKey) => void
  onOpenAllFunctions: () => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
}

export default function PlatformOverviewPage({ items, applications, preference, onOpen, onOpenApplication, onOpenAllFunctions, onSave, preferenceBusy = false }: PlatformOverviewPageProps) {
  const search = useWorkspaceFunctionSearch(items)
  const { saving, error, toggleFavorite } = useWorkspacePreferenceActions(preference, onSave, preferenceBusy)
  const itemByKey = new Map(items.map((item) => [item.key, item]))
  const favoriteItems = preference.pinned.flatMap((key) => {
    const item = itemByKey.get(key)
    return item ? [item] : []
  })

  return (
    <section aria-label="宇峰业务平台" className="space-y-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">宇峰业务平台</h1>
          <p className="mt-1 text-sm text-gray-500">选择业务应用，或直接搜索需要的功能。</p>
        </div>
        <AppButton variant="secondary" size="sm" onClick={onOpenAllFunctions}>功能目录</AppButton>
      </div>
      <WorkspaceFunctionSearch search={search} storageKey="mes-lite.searchPresets.workspace" mobileContentSearch />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {search.searching ? (
        <section aria-label="功能搜索结果" className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">搜索结果 <span className="text-sm font-normal text-gray-500">{search.visibleItems.length} 项</span></h2>
          {search.visibleItems.length > 0
            ? <WorkspaceFunctionGroups items={search.visibleItems} preference={preference} saving={saving} onOpen={onOpen} onToggleFavorite={toggleFavorite} />
            : <p className="py-8 text-center text-sm text-gray-500">没有匹配的功能，试试其他名称、分组或说明。</p>}
        </section>
      ) : (
        <>
          <section aria-label="业务应用" className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">业务应用</h2>
            {applications.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {applications.map((application) => {
                  const Icon = application.key === 'mes' ? Factory : Users
                  return (
                    <AppButton
                      key={application.key}
                      variant="secondary"
                      onClick={() => onOpenApplication(application.key)}
                      aria-label={`进入${application.label}`}
                      className="!h-auto min-h-40 !w-full !shrink !items-start !justify-start !gap-4 !whitespace-normal !p-5 !text-left"
                    >
                      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-6 w-6" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2"><span className="text-lg font-semibold text-gray-900">{application.label}</span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" /></span>
                        <span className="mt-2 block text-sm leading-6 text-gray-500">{application.description}</span>
                        <span className="mt-3 block text-xs text-gray-400">{application.items.length} 个可用功能</span>
                      </span>
                    </AppButton>
                  )
                })}
              </div>
            ) : <p className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">当前账号暂无可用业务应用。</p>}
          </section>
          <section aria-label="我的收藏" className="space-y-3 border-t border-gray-100 pt-5">
            <h2 className="text-base font-semibold text-gray-900">我的收藏 <span className="text-sm font-normal text-gray-500">{favoriteItems.length} 项</span></h2>
            {favoriteItems.length > 0
              ? <WorkspaceFunctionGroups items={favoriteItems} preference={preference} saving={saving} onOpen={onOpen} onToggleFavorite={toggleFavorite} />
              : <p className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">从搜索结果或功能目录收藏常用功能，即可在这里直接打开。</p>}
          </section>
        </>
      )}
    </section>
  )
}
