'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import type { CurrentOperator } from '../AuthGate'
import AppLoadingIndicator from '../AppLoadingIndicator'
import { AllFunctionsPage, type WorkspaceFunctionItem } from '@/modules/workspace'
import type { ApplicationTab, PageModuleDefinition, PageRendererKey } from '@/lib/page-registry'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'

function FeaturePageLoading() {
  return <AppLoadingIndicator label="正在加载页面..." />
}

const MaterialInPage = dynamic(() => import('@/modules/receiving'), { loading: FeaturePageLoading })
const DispatchPage = dynamic(() => import('@/modules/production').then((module) => module.DispatchPageModule), { loading: FeaturePageLoading })
const SalesOrderPage = dynamic(() => import('@/modules/sales'), { loading: FeaturePageLoading })
const ShipmentPage = dynamic(() => import('@/modules/sales').then((module) => module.ShipmentPageModule), { loading: FeaturePageLoading })
const ReturnPage = dynamic(() => import('@/modules/sales').then((module) => module.ReturnPageModule), { loading: FeaturePageLoading })
const FlowTransferPage = dynamic(() => import('@/modules/production').then((module) => module.FlowTransferPageModule), { loading: FeaturePageLoading })
const EmployeePage = dynamic(() => import('@/modules/configuration').then((module) => module.EmployeePageModule), { loading: FeaturePageLoading })
const SawingCostCalculatorPage = dynamic(() => import('@/modules/operations-tools').then((module) => module.SawingCostCalculatorPageModule), { loading: FeaturePageLoading })
const ScanPrintPage = dynamic(() => import('@/modules/operations-tools').then((module) => module.ScanPrintPageModule), { loading: FeaturePageLoading })
const BomOverviewPage = dynamic(() => import('@/modules/bom'), { loading: FeaturePageLoading })
const MaterialPage = dynamic(() => import('@/modules/materials'), { loading: FeaturePageLoading })
const WorkInstructionPage = dynamic(() => import('@/modules/documents'), { loading: FeaturePageLoading })
const DocumentCategorySettingsPage = dynamic(() => import('@/modules/documents').then((module) => module.DocumentCategorySettingsPage), { loading: FeaturePageLoading })
const EquipmentPage = dynamic(() => import('@/modules/equipment'), { loading: FeaturePageLoading })
const OperatorPage = dynamic(() => import('@/modules/identity-access').then((module) => module.OperatorPageModule), { loading: FeaturePageLoading })
const SystemPage = dynamic(() => import('../SystemPage'), { loading: FeaturePageLoading })
const PermissionPage = dynamic(() => import('@/modules/identity-access').then((module) => module.PermissionPageModule), { loading: FeaturePageLoading })
const DashboardPage = dynamic(() => import('@/modules/workspace'), { loading: FeaturePageLoading })
const ProductionOrderModule = dynamic(() => import('@/modules/production'), { loading: FeaturePageLoading })
const StockPageModule = dynamic(() => import('@/modules/inventory'), { loading: FeaturePageLoading })

export interface BomEditorTarget {
  materialId: string
  bomId?: string
  requestId: number
}

export interface WorkspacePageRenderContext {
  tab: ApplicationTab
  operator: CurrentOperator
  workspaceItems: WorkspaceFunctionItem[]
  workspacePreference: WorkspacePreferenceValue
  bomEditorTarget: BomEditorTarget | null
  canRead: (resource: string) => boolean
  canCreate: (resource: string) => boolean
  canUpdate: (resource: string) => boolean
  canDelete: (resource: string) => boolean
  onMessage: (message: string) => void
  onOpenWorkspaceFunction: (key: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSaveWorkspacePreference: (preference: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>
  onTabChange: (tab: ApplicationTab) => void
  onProductionOrderStateSummaryChange: (summary: string) => void
  onStockStateSummaryChange: (summary: string) => void
  onOpenBomEditor: (materialId: string, bomId?: string) => void
  onBomEditorTargetHandled: () => void
}

type PageRenderer = (context: WorkspacePageRenderContext, definition: PageModuleDefinition) => ReactNode

const pageRendererRegistry: Record<PageRendererKey, PageRenderer> = {
  dashboard: (context) => (
    <DashboardPage
      items={context.workspaceItems}
      preference={context.workspacePreference}
      onOpen={context.onOpenWorkspaceFunction}
      onOpenAllFunctions={context.onOpenAllFunctions}
      onSave={context.onSaveWorkspacePreference}
    />
  ),
  'all-functions': (context) => (
    <AllFunctionsPage
      items={context.workspaceItems}
      preference={context.workspacePreference}
      onOpen={context.onOpenWorkspaceFunction}
    />
  ),
  'production-orders': (context) => (
    <ProductionOrderModule
      mode={context.tab as 'orders' | 'create' | 'detail'}
      canCreate={context.canCreate('orders')}
      onModeChange={context.onTabChange}
      onMessage={context.onMessage}
      onStateSummaryChange={context.onProductionOrderStateSummaryChange}
    />
  ),
  stocks: (context) => (
    <StockPageModule
      operatorName={context.operator.name || context.operator.username}
      canUpdateStock={context.canUpdate('stocks')}
      onMessage={context.onMessage}
      onStateSummaryChange={context.onStockStateSummaryChange}
    />
  ),
  materials: (context) => (
    <MaterialPage
      onMessage={context.onMessage}
      showBomWorkspace={false}
      canReadBom={context.canRead('bomCost')}
      canCreateBom={context.canUpdate('bomCost')}
      onOpenBomWorkspace={(materialId) => context.onOpenBomEditor(materialId)}
    />
  ),
  'bom-workspace': (context) => (
    <MaterialPage
      onMessage={context.onMessage}
      showBomWorkspace
      openBomRequest={context.bomEditorTarget}
      onOpenBomRequestHandled={context.onBomEditorTargetHandled}
    />
  ),
  'bom-usage': (context) => (
    <div className="min-w-0">
      <BomOverviewPage onMessage={context.onMessage} onOpenBom={context.onOpenBomEditor} />
    </div>
  ),
  'work-instructions': (context) => <WorkInstructionPage onMessage={context.onMessage} />,
  'document-categories': (context) => (
    <DocumentCategorySettingsPage
      onMessage={context.onMessage}
      canUpdate={context.canUpdate('workInstructions')}
      canDelete={context.canDelete('workInstructions')}
    />
  ),
  equipment: (context) => (
    <EquipmentPage
      onMessage={context.onMessage}
      canCreate={context.canCreate('equipment')}
      canUpdate={context.canUpdate('equipment')}
      canDelete={context.canDelete('equipment')}
    />
  ),
  'material-in': (context) => <MaterialInPage onMessage={context.onMessage} />,
  dispatch: (context) => <DispatchPage onMessage={context.onMessage} />,
  'sales-orders': (context) => <SalesOrderPage onMessage={context.onMessage} />,
  shipment: (context) => <ShipmentPage onMessage={context.onMessage} />,
  return: (context) => <ReturnPage onMessage={context.onMessage} />,
  'flow-transfers': (context) => <FlowTransferPage onMessage={context.onMessage} />,
  employees: (context) => (
    <EmployeePage
      onMessage={context.onMessage}
      canCreate={context.canCreate('system')}
      canUpdate={context.canUpdate('system')}
    />
  ),
  'sawing-cost': () => <SawingCostCalculatorPage />,
  'scan-print': (context) => <ScanPrintPage onMessage={context.onMessage} />,
  operators: (context) => <OperatorPage currentOperator={context.operator} onMessage={context.onMessage} />,
  'system-section': (context, definition) => definition.systemSection
    ? <SystemPage section={definition.systemSection} onMessage={context.onMessage} />
    : null,
  'permission-users': (context) => <PermissionPage mode="users" onMessage={context.onMessage} />,
  'permission-groups': (context) => <PermissionPage mode="groups" onMessage={context.onMessage} />,
}

export function renderRegisteredWorkspacePage(definition: PageModuleDefinition, context: WorkspacePageRenderContext) {
  return pageRendererRegistry[definition.renderer](context, definition)
}
