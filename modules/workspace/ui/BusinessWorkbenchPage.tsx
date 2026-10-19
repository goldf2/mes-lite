'use client'

import { ArrowLeft } from 'lucide-react'
import AppButton from '@/app/components/AppButton'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import type { BusinessModuleDefinition, BusinessModuleKey } from '../domain/business-modules'
import { getAvailableBusinessApplications, type AvailableBusinessApplication, type BusinessApplicationKey } from '../domain/business-applications'
import { WorkspaceLauncher, type WorkspaceFunctionItem } from './WorkspacePages'
import type { SaveWorkspacePreference } from './WorkspaceFunctionCatalog'
import PlatformOverviewPage from './PlatformOverviewPage'

interface BusinessWorkbenchPageProps {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (functionKey: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
  businessModule?: BusinessModuleDefinition | null
  businessModules?: Array<BusinessModuleDefinition & { items: WorkspaceFunctionItem[] }>
  businessApplications?: Array<AvailableBusinessApplication<WorkspaceFunctionItem>>
  onOpenBusinessApplication?: (key: BusinessApplicationKey) => void
  onOpenBusinessModule?: (key: BusinessModuleKey) => void
  onOpenBusinessPlatform?: () => void
}

export default function BusinessWorkbenchPage({ businessModule, businessModules = [], businessApplications, onOpenBusinessApplication, onOpenBusinessModule, onOpenBusinessPlatform, ...props }: BusinessWorkbenchPageProps) {
  const applications = businessApplications || getAvailableBusinessApplications(props.items)
  const selectedModule = businessModule ? businessModules.find((item) => item.key === businessModule.key) : undefined
  const openPlatform = () => onOpenBusinessPlatform ? onOpenBusinessPlatform() : props.onOpen('businessWorkbench')
  const openApplication = (key: BusinessApplicationKey) => {
    if (onOpenBusinessApplication) onOpenBusinessApplication(key)
    else if (key === 'mes') props.onOpen('dashboard')
    else {
      const destinationModule = applications.find((application) => application.key === key)?.modules[0]
      if (!destinationModule) return
      if (onOpenBusinessModule) onOpenBusinessModule(destinationModule.key)
      else window.location.assign(`/?page=businessWorkbench&module=${destinationModule.key}`)
    }
  }

  if (!selectedModule) return <PlatformOverviewPage {...props} applications={applications} onOpenApplication={openApplication} />

  const customerApplication = selectedModule.ownerApp === 'data-platform'
    ? applications.find((application) => application.key === 'customers')
    : undefined
  const items = customerApplication?.items || selectedModule.items
  const title = customerApplication?.label || selectedModule.label
  const description = customerApplication?.description || selectedModule.description
  const moduleContent = (
    <section aria-label={`${title}工作空间`} className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">{description}</p>
          <p className="mt-1 text-xs text-gray-500">{selectedModule.ownerApp === 'mes' ? 'MES Lite' : '数据平台'} · {items.length} 个可用功能</p>
        </div>
        <AppButton variant="secondary" onClick={openPlatform}><ArrowLeft aria-hidden="true" className="h-4 w-4" />返回业务总览</AppButton>
      </div>
    </section>
  )

  return <WorkspaceLauncher key={customerApplication?.key || selectedModule.key} {...props} items={items} searchItems={props.items} title={title} mobileContentSearch beforeContent={moduleContent} showAllFunctions />
}
