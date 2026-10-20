'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, ExternalLink, Factory, LayoutGrid, Users } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
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

const QUICK_TOOL_KEYS: WorkspaceFunctionKey[] = ['scanPrint', 'sawingCost', 'helpCenter', 'warehouseDigitalTwin']

export default function PlatformOverviewPage({
  items,
  applications,
  businessModules,
  preference,
  onOpen,
  onOpenApplication,
  onOpenBusinessModule,
  onOpenAllFunctions,
  onSave,
  preferenceBusy = false,
}: PlatformOverviewPageProps) {
  const [selectedModuleKey, setSelectedModuleKey] = useState<BusinessModuleKey | 'ALL'>('ALL')
  const [showDescriptions, setShowDescriptions] = useState(false)
  const platformItems = useMemo(() => items.filter((item) => item.key !== 'businessWorkbench'), [items])
  const search = useWorkspaceFunctionSearch(platformItems)
  const { saving, error, toggleFavorite } = useWorkspacePreferenceActions(preference, onSave, preferenceBusy)

  const itemByKey = useMemo(() => new Map(platformItems.map((item) => [item.key, item])), [platformItems])

  const favoriteItems = useMemo(
    () => preference.pinned.flatMap((key) => {
      const item = itemByKey.get(key)
      return item ? [item] : []
    }),
    [itemByKey, preference.pinned],
  )

  const recentUsageItems = useMemo(
    () => [...preference.usage]
      .sort((a, b) => b.useCount - a.useCount || (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
      .flatMap((entry) => {
        const item = itemByKey.get(entry.functionKey)
        return item ? [{ item, useCount: entry.useCount }] : []
      })
      .slice(0, 5),
    [itemByKey, preference.usage],
  )

  const quickToolItems = useMemo(
    () => QUICK_TOOL_KEYS.flatMap((key) => {
      const item = itemByKey.get(key)
      return item ? [item] : []
    }),
    [itemByKey],
  )

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
    <section aria-label="宇峰业务平台" className="space-y-3">
      {/* 紧凑页头栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-base font-semibold text-gray-900 sm:text-lg">宇峰业务平台</h1>
          <span className="text-xs text-gray-500">
            {applications.length} 个独立应用 · 已授权 {platformItems.length} 项功能
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="ghost"
            size="sm"
            aria-pressed={showDescriptions}
            onClick={() => setShowDescriptions((current) => !current)}
            className="!h-10 !px-2.5 !text-xs"
          >
            {showDescriptions ? '隐藏功能说明' : '显示功能说明'}
          </AppButton>
          <AppButton variant="secondary" size="sm" onClick={onOpenAllFunctions} className="!h-10 !px-2.5 !text-xs">
            功能目录
          </AppButton>
        </div>
      </div>

      {/* 桌面端通过 TopBarPortal 挂载于顶部单行工具栏，移动端 (<1024px) 在标题下方整行可见 */}
      <WorkspaceFunctionSearch search={search} storageKey="mes-lite.searchPresets.workspace" mobileContentSearch />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* 左 - 中 - 右 三栏工作台布局 */}
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_272px]">
        {/* ==================== 左侧分区：独立应用入口 + 业务领域分类导航 ==================== */}
        <aside aria-label="应用与领域导航" className="min-w-0 space-y-3.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-16 xl:row-span-1">
          <section aria-label="业务应用" className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold text-gray-500">独立应用入口</h2>
              <span className="text-[11px] text-gray-400">直达系统</span>
            </div>
            {applications.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {applications.map((application) => {
                  const Icon = application.key === 'mes' ? Factory : application.key === 'customers' ? Users : LayoutGrid
                  const isDataPlatform = application.ownerApp === 'data-platform'
                  return (
                    <AppButton
                      key={application.key}
                      variant="secondary"
                      onClick={() => onOpenApplication(application.key)}
                      aria-label={`进入${application.label}`}
                      title={application.description}
                      className={`!h-auto !w-full !shrink !items-center !justify-start !gap-2.5 !whitespace-normal !px-2.5 !py-2 !text-left ${
                        isDataPlatform ? 'hover:!border-emerald-300 hover:!bg-emerald-50/50' : 'hover:!border-blue-300 hover:!bg-blue-50/50'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                          isDataPlatform ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-semibold text-gray-900">{application.label}</span>
                          <span className="shrink-0 text-[11px] font-normal text-gray-400">{application.items.length}项 →</span>
                        </span>
                        <span className="block truncate text-[11px] font-normal text-gray-500">
                          {isDataPlatform ? '数据平台 · 客户与设备' : '制造经营工作台 · 首页'}
                        </span>
                      </span>
                    </AppButton>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 px-2.5 py-2 text-xs text-gray-500">
                当前账号暂无可用业务应用。
              </p>
            )}
          </section>

          <section aria-label="业务领域分类" className="space-y-1.5 border-t border-gray-100 pt-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold text-gray-500">业务领域分区</h2>
              <span className="text-[11px] text-gray-400">{availableModules.length} 个分区</span>
            </div>
            <nav aria-label="业务分区筛选" className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              <AppButton
                variant="ghost"
                aria-pressed={activeModuleFilter === 'ALL'}
                onClick={() => {
                  setSelectedModuleKey('ALL')
                  search.resetSearch()
                }}
                className={`!h-auto min-h-10 min-w-10 !justify-between !gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition lg:w-full ${
                  activeModuleFilter === 'ALL'
                    ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>全部分区</span>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{totalModuleFunctions}</span>
              </AppButton>
              {availableModules.map((module) => {
                const active = activeModuleFilter === module.key
                const isData = module.ownerApp === 'data-platform'
                return (
                  <AppButton
                    key={module.key}
                    variant="ghost"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedModuleKey(module.key)
                      search.resetSearch()
                    }}
                    className={`!h-auto min-h-10 min-w-10 !justify-between !gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition lg:w-full ${
                      active
                        ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="truncate">
                      {module.label}
                      {isData ? ' ↗' : ''}
                    </span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{module.items.length}</span>
                  </AppButton>
                )
              })}
            </nav>
          </section>
        </aside>

        {/* ==================== 右侧分区：我的常用 + 高频最近访问 + 辅助工具 ==================== */}
        <aside aria-label="个人常用与高频访问" className="min-w-0 space-y-3.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm lg:col-start-2 lg:row-start-1 xl:col-start-3 xl:sticky xl:top-16">
          <section aria-label="我的收藏" className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-xs font-semibold text-gray-900 sm:text-sm">我的常用</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{favoriteItems.length} 项</span>
            </div>
            {favoriteItems.length > 0 ? (
              <WorkspaceFunctionCardGrid
                items={favoriteItems}
                preference={preference}
                saving={saving}
                onOpen={onOpen}
                onToggleFavorite={toggleFavorite}
                compact
                showDescription={false}
                columnsClassName="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-2"
              />
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-2.5 text-xs text-gray-500">
                点击功能右侧的星标，即可添加到我的常用。
              </p>
            )}
          </section>

          <section aria-label="高频访问" className="space-y-1.5 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-xs font-semibold text-gray-900">高频访问</h2>
              <span className="text-[11px] text-gray-400">自动记录</span>
            </div>
            {recentUsageItems.length > 0 ? (
              <div className="space-y-1">
                {recentUsageItems.map(({ item, useCount }) => (
                  <AppButton
                    key={item.key}
                    variant="ghost"
                    onClick={() => onOpen(item.key)}
                    aria-label={`打开高频功能${item.label}`}
                    className="!h-auto min-h-10 min-w-10 w-full !justify-between !gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-gray-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                          item.externalHref ? 'bg-emerald-100/80 text-emerald-700' : 'bg-blue-100/75 text-blue-700'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="truncate font-medium text-gray-800">{item.label}</span>
                      {item.externalHref && <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0 text-gray-400" />}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-400">{useCount} 次</span>
                  </AppButton>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-2.5 text-xs text-gray-500">
                打开业务功能后将在此自动记录高频访问入口。
              </p>
            )}
          </section>

          {quickToolItems.length > 0 && (
            <section aria-label="辅助工具与帮助" className="space-y-1.5 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between px-0.5">
                <h2 className="text-xs font-semibold text-gray-900">辅助工具与帮助</h2>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {quickToolItems.map((item) => (
                  <AppButton
                    key={item.key}
                    variant="ghost"
                    onClick={() => onOpen(item.key)}
                    aria-label={`打开工具${item.label}`}
                    className="!h-auto min-h-10 min-w-10 !justify-start !gap-1.5 !whitespace-normal rounded-lg border border-gray-200/80 bg-gray-50/60 px-2 py-1.5 text-left text-xs font-medium text-gray-700 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700"
                  >
                    <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-100/75 text-[11px] font-semibold text-blue-700">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </AppButton>
                ))}
              </div>
            </section>
          )}
        </aside>

        {/* ==================== 中间主分区：搜索结果 / 业务功能总览多列矩阵 ==================== */}
        <div aria-label="业务功能总览主工作区" className="min-w-0 space-y-3.5 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4 lg:col-start-2 lg:row-start-2 xl:row-start-1">
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
                          showDescription={showDescriptions || isSingleModule}
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


      </div>
    </section>
  )
}
