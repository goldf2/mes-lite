'use client'

import { ChevronDown, Factory, LayoutGrid } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import AppButton from '../AppButton'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'
import type { WorkspaceNavigationConfig } from '@/lib/workspace-navigation-config'

interface ModuleOption<Key extends string> {
  key: Key
  label: string
  ownerApp: string
  items: readonly unknown[]
}

export default function CapabilityModuleButtons<Key extends string>({
  config,
  compact = false,
  modules,
  activeModule,
  isMesHome = false,
  onOpenHome,
  onOpenPlatform,
  onOpenModule,
}: {
  config: WorkspaceNavigationConfig
  compact?: boolean
  modules: Array<ModuleOption<Key>>
  activeModule: Pick<ModuleOption<Key>, 'key' | 'label'> | null
  isMesHome?: boolean
  onOpenHome: () => void
  onOpenPlatform: () => void
  onOpenModule: (key: Key) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const close = useCallback(() => setOpen(false), [])
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, close)
  const currentLabel = activeModule?.label || (isMesHome ? `${config.moduleButtons.mes.label} 首页` : '业务总览')
  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLButtonElement>('[role="dialog"] button')?.focus({ preventScroll: true })
  }, [open, rootRef])

  return (
    <div
      ref={rootRef}
      className="relative min-w-0 flex-1"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        rootRef.current?.querySelector<HTMLButtonElement>('[data-module-trigger]')?.focus({ preventScroll: true })
      }}
    >
      <AppButton
        variant="secondary"
        fullWidth
        data-module-trigger
        aria-label={`切换业务模块，当前${currentLabel}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={`!min-w-0 !shrink !justify-start !gap-1.5 !font-semibold !text-gray-800 ${compact ? '!px-2 !text-xs' : '!px-3 !text-sm'}`}
      >
        <LayoutGrid aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </AppButton>
      {open && (
        <div id={panelId} role="dialog" aria-label="切换业务模块" className="absolute left-0 top-full z-[130] mt-2 max-h-[min(70dvh,36rem)] w-72 max-w-[calc(88vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
          <div className="border-b border-gray-100 pb-2">
            <AppButton variant="ghost" fullWidth onClick={() => choose(onOpenPlatform)} aria-current={!activeModule && !isMesHome ? 'page' : undefined} className="!justify-start !text-gray-800"><LayoutGrid aria-hidden="true" className="h-4 w-4" />业务总览</AppButton>
            <AppButton variant="ghost" fullWidth onClick={() => choose(onOpenHome)} aria-current={isMesHome ? 'page' : undefined} className="!justify-start !text-gray-800"><Factory aria-hidden="true" className="h-4 w-4" />{config.moduleButtons.mes.label} 首页</AppButton>
          </div>
          <div className="px-2 pb-1 pt-3 text-xs font-semibold text-gray-500">业务模块</div>
          <div className="space-y-1">
            {modules.map((module) => (
              <AppButton key={module.key} variant="ghost" fullWidth onClick={() => choose(() => onOpenModule(module.key))} aria-current={activeModule?.key === module.key ? 'page' : undefined} aria-label={`进入${module.label}`} className={`!h-auto min-h-10 !justify-start !whitespace-normal !px-3 !py-2 !text-left ${activeModule?.key === module.key ? '!bg-blue-50 !text-blue-700' : '!text-gray-700'}`}>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{module.label}</span><span className="mt-0.5 block text-xs font-normal text-gray-400">{module.ownerApp === 'mes' ? 'MES Lite' : '数据平台'} · {module.items.length} 个功能</span></span>
              </AppButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
