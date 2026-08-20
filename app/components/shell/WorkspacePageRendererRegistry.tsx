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
const EquipmentInspectionPage = dynamic(() => import('@/modules/equipment').then((module) => module.EquipmentInspectionPageModule), { loading: FeaturePageLoading })
const EquipmentMaintenancePage = dynamic(() => import('@/modules/equipment').then((module) => module.EquipmentMaintenancePageModule), { loading: FeaturePageLoading })
const OperatorPage = dynamic(() => import('@/modules/identity-access').then((module) => module.OperatorPageModule), { loading: FeaturePageLoading })
const SystemPage = dynamic(() => import('../SystemPage'), { loading: FeaturePageLoading })
const PermissionPage = dynamic(() => import('@/modules/identity-access').then((module) => module.PermissionPageModule), { loading: FeaturePageLoading })
const DashboardPage = dynamic(() => import('@/modules/workspace'), { loading: FeaturePageLoading })
const ProductionOrderModule = dynamic(() => import('@/modules/production'), { loading: FeaturePageLoading })
const StockPageModule = dynamic(() => import('@/modules/inventory'), { loading: FeaturePageLoading })
const StockMovementPageModule = dynamic(() => import('@/modules/inventory').then((module) => module.StockMovementPageModule), { loading: FeaturePageLoading })
const InventoryLotPanoramaPageModule = dynamic(() => import('@/modules/inventory').then((module) => module.InventoryLotPanoramaPageModule), { loading: FeaturePageLoading })
const QualityTaskPageModule = dynamic(() => import('@/modules/quality').then((module) => module.QualityTaskPageModule), { loading: FeaturePageLoading })
const SopHelpCenterPage = dynamic(() => import('@/modules/sop').then((module) => module.SopHelpCenterPage), { loading: FeaturePageLoading })

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
  onOpenWorkspaceFunction: (key: WorkspaceFunctionKey, task?: string) => void
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
  'sop-help-center': () => <SopHelpCenterPage />,
  'production-orders': (context) => (
    <ProductionOrderModule
      mode={context.tab as 'orders' | 'create' | 'detail'}
      canCreate={context.canCreate('orders')}
      canDeleteActual={context.canDelete('productionActualEntry')}
      canRelease={context.canUpdate('productionOrderRelease')}
      canEnterActual={context.canUpdate('productionActualEntry')}
      canConfirmActual={context.canUpdate('productionActualConfirm')}
      canReverseActual={context.canUpdate('productionActualReverse')}
      canQualityUpdate={context.canUpdate('qualityDecision')}
      onModeChange={context.onTabChange}
      onMessage={context.onMessage}
      onStateSummaryChange={context.onProductionOrderStateSummaryChange}
    />
  ),
  stocks: (context) => (
    <StockPageModule
      canUpdateStock={context.canUpdate('stocks')}
      onMessage={context.onMessage}
      onStateSummaryChange={context.onStockStateSummaryChange}
    />
  ),
  'stock-movements': (context) => <StockMovementPageModule onMessage={context.onMessage} />,
  'lot-panorama': (context) => <InventoryLotPanoramaPageModule onMessage={context.onMessage} />,
  'quality-tasks': (context) => <QualityTaskPageModule canDecide={context.canUpdate('qualityDecision')} canDispose={context.canUpdate('qualityDisposition')} canRelease={context.canUpdate('qualityRelease')} canReadStandards={context.canRead('qualityStandards')} canCreateStandards={context.canCreate('qualityStandards')} canUpdateStandards={context.canUpdate('qualityStandards')} canReadAttachments={context.canRead('attachments')} canManageAttachments={context.canCreate('attachments') && context.canUpdate('quality')} onMessage={context.onMessage} />,
  materials: (context) => (
    <MaterialPage
      onMessage={context.onMessage}
      showBomWorkspace={false}
      canReadBom={context.canRead('bom')}
      canCreateBom={context.canCreate('bom')}
      canUpdateBom={context.canUpdate('bom')}
      canDeleteBom={context.canDelete('bom')}
      onOpenBomWorkspace={(materialId) => context.onOpenBomEditor(materialId)}
    />
  ),
  'bom-workspace': (context) => (
    <MaterialPage
      onMessage={context.onMessage}
      showBomWorkspace
      canCreateBom={context.canCreate('bom')}
      canUpdateBom={context.canUpdate('bom')}
      canDeleteBom={context.canDelete('bom')}
      openBomRequest={context.bomEditorTarget}
      onOpenBomRequestHandled={context.onBomEditorTargetHandled}
    />
  ),
  'bom-usage': (context) => (
    <div className="min-w-0">
      <BomOverviewPage onMessage={context.onMessage} onOpenBom={context.onOpenBomEditor} />
    </div>
  ),
  'work-instructions': (context) => (
    <WorkInstructionPage
      onMessage={context.onMessage}
      canRegeneratePreviews={context.canUpdate('workInstructions') && context.canRead('attachments')}
    />
  ),
  'document-categories': (context) => (
    <DocumentCategorySettingsPage
      onMessage={context.onMessage}
      canUpdate={context.canUpdate('documentCategories')}
      canDelete={context.canDelete('documentCategories')}
    />
  ),
  equipment: (context) => (
    <EquipmentPage
      onMessage={context.onMessage}
      canCreate={context.canCreate('equipment')}
      canUpdate={context.canUpdate('equipment')}
      canDelete={context.canDelete('equipment')}
      canCommand={context.canUpdate('equipmentEvents')}
    />
  ),
  'equipment-inspections': (context) => (
    <EquipmentInspectionPage
      onMessage={context.onMessage}
      canCreate={context.canCreate('equipmentInspections')}
      canUpdate={context.canUpdate('equipmentInspections')}
      canManageAttachments={context.canUpdate('equipmentInspections') && context.canCreate('attachments')}
    />
  ),
  'equipment-maintenance': (context) => (
    <EquipmentMaintenancePage
      onMessage={context.onMessage}
      canCreate={context.canCreate('equipmentMaintenance')}
      canUpdate={context.canUpdate('equipmentMaintenance')}
      canManageAttachments={context.canUpdate('equipmentMaintenance') && context.canCreate('attachments')}
    />
  ),
  'material-in': (context) => (
    <MaterialInPage
      onMessage={context.onMessage}
      canCreate={context.canCreate('materialIn')}
      canUpdate={context.canUpdate('materialIn')}
      canReceive={context.canUpdate('materialInReceive')}
      canReverse={context.canUpdate('materialInReverse')}
    />
  ),
  dispatch: (context) => <DispatchPage onMessage={context.onMessage} />,
  'sales-orders': (context) => <SalesOrderPage onMessage={context.onMessage} />,
  shipment: (context) => (
    <ShipmentPage
      onMessage={context.onMessage}
      canCreate={context.canCreate('shipment')}
      canDispatch={context.canUpdate('shipmentDispatch')}
      canDeliver={context.canUpdate('shipmentDeliver')}
      canCancel={context.canUpdate('shipmentCancel')}
      canPackage={context.canUpdate('shipmentDispatch')}
      canManagePackageAttachments={context.canUpdate('shipmentDispatch') && context.canCreate('attachments')}
    />
  ),
  return: (context) => (
    <ReturnPage
      onMessage={context.onMessage}
      canQualityUpdate={context.canUpdate('qualityDecision')}
      canCreate={context.canCreate('return')}
      canReceive={context.canUpdate('returnReceive')}
      canReject={context.canUpdate('returnReject')}
    />
  ),
  'flow-transfers': (context) => (
    <FlowTransferPage
      onMessage={context.onMessage}
      canCreate={context.canCreate('flowTransfers')}
      canUpdate={context.canUpdate('flowTransfers')}
      canConfirm={context.canUpdate('flowTransferConfirm')}
      canReverse={context.canUpdate('flowTransferReverse')}
    />
  ),
  employees: (context) => (
    <EmployeePage
      onMessage={context.onMessage}
      canCreate={context.canCreate('employees')}
      canUpdate={context.canUpdate('employees')}
    />
  ),
  'sawing-cost': () => <SawingCostCalculatorPage />,
  'scan-print': (context) => <ScanPrintPage onMessage={context.onMessage} />,
  operators: (context) => <OperatorPage currentOperator={context.operator} onMessage={context.onMessage} />,
  'system-section': (context, definition) => definition.systemSection
    ? <SystemPage section={definition.systemSection} onMessage={context.onMessage} canCreate={context.canCreate(definition.resource)} canUpdate={context.canUpdate(definition.resource)} canDelete={context.canDelete(definition.resource)} />
    : null,
  'permission-users': (context) => <PermissionPage mode="users" onMessage={context.onMessage} />,
  'permission-groups': (context) => <PermissionPage mode="groups" onMessage={context.onMessage} />,
}

export function renderRegisteredWorkspacePage(definition: PageModuleDefinition, context: WorkspacePageRenderContext) {
  return pageRendererRegistry[definition.renderer](context, definition)
}
