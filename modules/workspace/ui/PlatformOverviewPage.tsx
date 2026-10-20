'use client'

import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import SearchableSelect from '@/app/components/SearchableSelect'
import AppButton from '@/app/components/AppButton'
import WorkspaceQuickAccess from './WorkspaceQuickAccess'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import type { AvailableBusinessApplication, BusinessApplicationKey } from '../domain/business-applications'
import {
  getAvailableBusinessModules,
  type BusinessModuleDefinition,
  type BusinessModuleKey,
} from '../domain/business-modules'
import {
  useWorkspaceFunctionSearch,
  useWorkspacePreferenceActions,
  WorkspaceFunctionCardGrid,
  WorkspaceFunctionGroups,
  WorkspaceFunctionSearch,
  type SaveWorkspacePreference,
  type WorkspaceFunctionItem,
} from './WorkspaceFunctionCatalog'

interface PlatformOverviewPageProps {
  items: WorkspaceFunctionItem[]
  applications: Array<AvailableBusinessApplication<WorkspaceFunctionItem>>
  businessModules?: Array<BusinessModuleDefinition & { items: WorkspaceFunctionItem[] }>
  preference: WorkspacePreferenceValue
  onOpen: (key: WorkspaceFunctionKey) => void
  onOpenApplication: (key: BusinessApplicationKey) => void
  onOpenBusinessModule?: (key: BusinessModuleKey) => void
  onOpenAllFunctions: () => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
}

export default function PlatformOverviewPage({
  items,
  businessModules,
  preference,
  onOpen,
  onOpenBusinessModule,
  onSave,
  preferenceBusy = false,
}: PlatformOverviewPageProps) {
  const [selectedModuleKey, setSelectedModuleKey] = useState<BusinessModuleKey | 'ALL'>('ALL')
  const platformItems = useMemo(() => items.filter((item) => item.key !== 'businessWorkbench'), [items])
  const search = useWorkspaceFunctionSearch(platformItems)
  const { saving, error, toggleFavorite } = useWorkspacePreferenceActions(preference, onSave, preferenceBusy)

  const availableModules = useMemo(
    () => (businessModules && businessModules.length > 0 ? businessModules : getAvailableBusinessModules(platformItems)),
    [businessModules, platformItems],
  )

  const activeModuleFilter = selectedModuleKey !== 'ALL' && availableModules.some((module) => module.key === selectedModuleKey)
    ? selectedModuleKey
    : 'ALL'

  const visibleModules = useMemo(
    () => (activeModuleFilter === 'ALL'
      ? availableModules
      : availableModules.filter((module) => module.key === activeModuleFilter)),
    [activeModuleFilter, availableModules],
  )

  const totalModuleFunctions = useMemo(
    () => availableModules.reduce((sum, module) => sum + module.items.length, 0),
    [availableModules],
  )

  const isSingleModule = activeModuleFilter !== 'ALL'

  return (
    <section aria-label="宇峰业务平台" className="mx-auto w-full max-w-[1920px] space-y-3.5">

      {/* 桌面搜索挂载到公共顶栏，移动端搜索在工作台内容前整行显示。 */}
      <WorkspaceFunctionSearch search={search} storageKey="mes-lite.searchPresets.workspace" mobileContentSearch />
      <WorkspaceQuickAccess items={platformItems} preference={preference} saving={saving} error={error} onOpen={onOpen} onToggleFavorite={toggleFavorite} includeTools />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div aria-label="业务功能总览主工作区" className="oak-workspace-home-main min-w-0 space-y-3.5 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="w-full sm:max-w-xs">
          <SearchableSelect
            value={activeModuleFilter}
            options={[
              { value: 'ALL', label: `全部分区 · ${totalModuleFunctions} 项功能` },
              ...availableModules.map((module) => ({ value: module.key, label: `${module.label} · ${module.items.length} 项${module.ownerApp === 'data-platform' ? ' ↗' : ''}` })),
            ]}
            placeholder="筛选业务分区"
            onChange={(key) => {
              setSelectedModuleKey(key === 'ALL' ? 'ALL' : availableModules.find((module) => module.key === key)?.key || 'ALL')
              search.resetSearch()
            }}
          />
        </div>
        {search.searching ? (
          <section aria-label="功能搜索结果" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                搜索结果 <span className="text-xs font-normal text-gray-500">{search.visibleItems.length} 项</span>
              </h2>
              <AppButton variant="ghost" size="sm" onClick={() => { setSelectedModuleKey('ALL'); search.resetSearch() }} className="!h-10 !px-2 !text-xs">
                返回全部总览
              </AppButton>
            </div>
            {search.visibleItems.length > 0 ? (
              <WorkspaceFunctionGroups
                items={search.visibleItems}
                preference={preference}
                saving={saving}
                onOpen={onOpen}
                onToggleFavorite={toggleFavorite}
                compact
              />
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">没有匹配的功能，试试其他名称、分组或说明。</p>
            )}
          </section>
        ) : (
          <section aria-label="业务功能总览" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  {isSingleModule && visibleModules[0] ? `${visibleModules[0].label} · 业务分区` : '全部业务功能分区'}
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {isSingleModule && visibleModules[0]
                    ? `${visibleModules[0].items.length} 项功能`
                    : `${availableModules.length} 个分区 · ${totalModuleFunctions} 项功能`}
                </span>
              </div>
              {isSingleModule && (
                <AppButton variant="ghost" size="sm" onClick={() => setSelectedModuleKey('ALL')} className="!h-10 !px-2 !text-xs">
                  查看全部分区
                </AppButton>
              )}
            </div>

            {visibleModules.length > 0 ? (
              <div
                className={
                  isSingleModule
                    ? 'grid grid-cols-1 gap-3'
                    : 'grid grid-cols-1 items-start gap-3 md:grid-cols-2'
                }
              >
                {visibleModules.map((module) => {
                  const isDataPlatform = module.ownerApp === 'data-platform'
                  const innerGridCols = isSingleModule
                    ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'
                    : module.items.length >= 9
                      ? 'grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-3'
                      : 'grid grid-cols-1 gap-1.5 sm:grid-cols-2'
                  return (
                    <section
                      key={module.key}
                      aria-label={`${module.label}功能`}
                      className="space-y-2 rounded-lg border border-gray-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-gray-900">{module.label}</h3>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                              isDataPlatform ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {isDataPlatform ? '数据平台' : 'MES Lite'}
                          </span>
                          <span className="shrink-0 text-xs text-gray-400">{module.items.length} 项</span>
                        </div>
                        {onOpenBusinessModule && (
                          <AppButton
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenBusinessModule(module.key)}
                            aria-label={`进入${module.label}分区`}
                            className="!h-10 !px-1.5 !text-xs"
                          >
                            专注视图 <ArrowRight aria-hidden="true" className="h-3 w-3" />
                          </AppButton>
                        )}
                      </div>
                      <WorkspaceFunctionCardGrid
                        items={module.items}
                        preference={preference}
                        saving={saving}
                        onOpen={onOpen}
                        onToggleFavorite={toggleFavorite}
                        compact
                        showDescription={isSingleModule}
                        columnsClassName={innerGridCols}
                      />
                    </section>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 px-3.5 py-4 text-sm text-gray-500">
                当前账号暂无已授权的业务功能分区。
              </p>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
