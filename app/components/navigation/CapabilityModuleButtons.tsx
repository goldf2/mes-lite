'use client'

import {
  navigationWorkspaceIds,
  type NavigationWorkspaceId,
  type WorkspaceNavigationConfig,
} from '@/lib/workspace-navigation-config'

const reservedDescriptions: Record<NavigationWorkspaceId, string> = {
  mes: '当前主模块，点击返回工作台首页',
  mrp: 'MRP 模块预留；现有计划与 BOM 用量仍在统一菜单',
  erp: 'ERP 模块预留；现有销售履约仍在统一菜单',
}

export default function CapabilityModuleButtons({
  config,
  compact = false,
  onOpenHome,
}: {
  config: WorkspaceNavigationConfig
  compact?: boolean
  onOpenHome: () => void
}) {
  const visibleModules = navigationWorkspaceIds.filter((moduleId) => config.moduleButtons[moduleId].visible)

  return (
    <div
      role="group"
      aria-label="产品模块"
      className={`flex min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-100 ${compact ? 'h-9 p-0.5' : 'h-10 p-1'}`}
    >
      {visibleModules.map((moduleId) => {
        const active = moduleId === 'mes'
        const label = config.moduleButtons[moduleId].label
        return (
          <button
            key={moduleId}
            type="button"
            disabled={!active}
            onClick={active ? onOpenHome : undefined}
            aria-current={active ? 'page' : undefined}
            aria-label={`${label}，${reservedDescriptions[moduleId]}`}
            title={reservedDescriptions[moduleId]}
            className={`relative min-w-0 rounded-md font-bold transition ${compact ? 'px-1 text-[11px] tracking-normal' : 'px-1.5 text-xs tracking-wide'} ${
              active
                ? `${compact ? 'flex-[1.6]' : 'flex-[1.45]'} bg-blue-600 text-white shadow-sm`
                : 'flex-1 cursor-not-allowed text-gray-400'
            }`}
          >
            <span className="block truncate">{label}</span>
            {!active && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
