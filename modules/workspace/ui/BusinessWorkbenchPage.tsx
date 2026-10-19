'use client'

import { ArrowLeft, ArrowRight, Factory, LayoutGrid } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import type { BusinessModuleDefinition, BusinessModuleKey } from '../domain/business-modules'
import { WorkspaceLauncher, type WorkspaceFunctionItem } from './WorkspacePages'
import type { SaveWorkspacePreference } from './WorkspaceFunctionCatalog'

interface BusinessWorkbenchPageProps {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (functionKey: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
  businessModule?: BusinessModuleDefinition | null
  businessModules?: Array<BusinessModuleDefinition & { items: WorkspaceFunctionItem[] }>
  onOpenBusinessModule?: (key: BusinessModuleKey) => void
  onOpenBusinessPlatform?: () => void
}

export default function BusinessWorkbenchPage({ businessModule, businessModules = [], onOpenBusinessModule, onOpenBusinessPlatform, ...props }: BusinessWorkbenchPageProps) {
  const selectedModule = businessModule ? businessModules.find((item) => item.key === businessModule.key) : undefined
  const openPlatform = () => onOpenBusinessPlatform ? onOpenBusinessPlatform() : props.onOpen('businessWorkbench')
  const moduleContent = selectedModule ? (
    <section aria-label={`${selectedModule.label}工作空间`} className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">{selectedModule.description}</p>
          <p className="mt-1 text-xs text-gray-500">{selectedModule.ownerApp === 'mes' ? 'MES Lite' : '数据平台'} · {selectedModule.items.length} 个可用功能</p>
        </div>
        <AppButton variant="secondary" onClick={openPlatform}><ArrowLeft aria-hidden="true" className="h-4 w-4" />返回业务总览</AppButton>
      </div>
    </section>
  ) : (
    <section aria-label="业务模块" className="space-y-3 border-b border-gray-100 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold text-gray-900">业务模块</h2><p className="mt-1 text-sm text-gray-500">按业务进入工作空间，也可搜索功能或使用下方收藏。</p></div>
        {props.items.some((item) => item.key === 'dashboard') && <AppButton variant="secondary" onClick={() => props.onOpen('dashboard')}><Factory aria-hidden="true" className="h-4 w-4" />MES Lite 首页</AppButton>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {businessModules.map((module) => (
          <AppButton
            key={module.key}
            variant="secondary"
            onClick={() => onOpenBusinessModule ? onOpenBusinessModule(module.key) : window.location.assign(`/?page=businessWorkbench&module=${module.key}`)}
            aria-label={`进入${module.label}`}
            className="!h-auto min-h-28 !w-full !shrink !items-start !justify-start !gap-3 !whitespace-normal !p-4 !text-left"
          >
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><LayoutGrid className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><span className="font-semibold text-gray-900">{module.label}</span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" /></span>
              <span className="mt-1 block text-xs leading-5 text-gray-500">{module.description}</span>
              <span className="mt-2 block text-xs text-gray-400">{module.ownerApp === 'mes' ? 'MES Lite' : '数据平台'} · {module.items.length} 个功能</span>
            </span>
          </AppButton>
        ))}
      </div>
    </section>
  )

  return <WorkspaceLauncher key={selectedModule?.key || 'overview'} {...props} items={selectedModule ? selectedModule.items : props.items} searchItems={props.items} title={selectedModule?.label || '宇峰业务平台'} mobileContentSearch beforeContent={moduleContent} showAllFunctions={Boolean(selectedModule)} />
}
