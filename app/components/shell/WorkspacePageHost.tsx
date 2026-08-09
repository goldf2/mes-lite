'use client'

import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import type { CurrentOperator } from '../AuthGate'
import AppLoadingIndicator from '../AppLoadingIndicator'
import { AllFunctionsPage, type WorkspaceFunctionItem } from '../WorkspacePages'
import PageModuleBoundary from '../page-modules/PageModuleBoundary'
import type { SystemSection } from '../SystemPage'
import type { MaterialSection, TabType } from '../../app-navigation'
import type { PageModuleDefinition } from '@/lib/page-modules'
import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'

function FeaturePageLoading() {
  return <AppLoadingIndicator label="正在加载页面..." />
}

const MaterialInPage = dynamic(() => import('../MaterialInPage'), { loading: FeaturePageLoading })
const DispatchPage = dynamic(() => import('../DispatchPage'), { loading: FeaturePageLoading })
const SalesOrderPage = dynamic(() => import('../SalesOrderPage'), { loading: FeaturePageLoading })
const ShipmentPage = dynamic(() => import('../ShipmentPage'), { loading: FeaturePageLoading })
const ReturnPage = dynamic(() => import('../ReturnPage'), { loading: FeaturePageLoading })
const FlowTransferPage = dynamic(() => import('../FlowTransferPage'), { loading: FeaturePageLoading })
const EmployeePage = dynamic(() => import('../EmployeePage'), { loading: FeaturePageLoading })
const SawingCostCalculatorPage = dynamic(() => import('../SawingCostCalculatorPage'), { loading: FeaturePageLoading })
const ScanPrintPage = dynamic(() => import('../ScanPrintPage'), { loading: FeaturePageLoading })
const BomOverviewPage = dynamic(() => import('../BomOverviewPage'), { loading: FeaturePageLoading })
const MaterialPage = dynamic(() => import('../MaterialPage'), { loading: FeaturePageLoading })
const WorkInstructionPage = dynamic(() => import('../WorkInstructionPage'), { loading: FeaturePageLoading })
const DocumentCategorySettingsPage = dynamic(() => import('@/modules/configuration').then((module) => module.DocumentCategorySettingsPage), { loading: FeaturePageLoading })
const EquipmentPage = dynamic(() => import('../EquipmentPage'), { loading: FeaturePageLoading })
const OperatorPage = dynamic(() => import('../OperatorPage'), { loading: FeaturePageLoading })
const SystemPage = dynamic(() => import('../SystemPage'), { loading: FeaturePageLoading })
const PermissionPage = dynamic(() => import('../PermissionPage'), { loading: FeaturePageLoading })
const DashboardPage = dynamic(() => import('@/modules/workspace'), { loading: FeaturePageLoading })
const ProductionOrderModule = dynamic(() => import('@/modules/production'), { loading: FeaturePageLoading })
const StockPageModule = dynamic(() => import('@/modules/inventory'), { loading: FeaturePageLoading })

export interface BomEditorTarget {
  materialId: string
  bomId?: string
  requestId: number
}

interface WorkspacePageHostProps {
  definition: PageModuleDefinition
  tab: TabType
  materialSection: MaterialSection
  message: string
  operator: CurrentOperator
  workspaceItems: WorkspaceFunctionItem[]
  workspacePreference: WorkspacePreferenceValue
  bomEditorTarget: BomEditorTarget | null
  activeSystemSection?: SystemSection
  canRead: (resource: string) => boolean
  canCreate: (resource: string) => boolean
  canUpdate: (resource: string) => boolean
  canDelete: (resource: string) => boolean
  onMessage: (message: string) => void
  onOpenWorkspaceFunction: (key: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSaveWorkspacePreference: (preference: Pick<WorkspacePreferenceValue, 'mode' | 'layout' | 'pinned'>) => Promise<void>
  onTabChange: (tab: TabType) => void
  onProductionOrderStateSummaryChange: (summary: string) => void
  onStockStateSummaryChange: (summary: string) => void
  onOpenBomEditor: (materialId: string, bomId?: string) => void
  onBomEditorTargetHandled: () => void
}

export default function WorkspacePageHost({
  definition,
  tab,
  materialSection,
  message,
  operator,
  workspaceItems,
  workspacePreference,
  bomEditorTarget,
  activeSystemSection,
  canRead,
  canCreate,
  canUpdate,
  canDelete,
  onMessage,
  onOpenWorkspaceFunction,
  onOpenAllFunctions,
  onSaveWorkspacePreference,
  onTabChange,
  onProductionOrderStateSummaryChange,
  onStockStateSummaryChange,
  onOpenBomEditor,
  onBomEditorTargetHandled,
}: WorkspacePageHostProps) {
  const toolbarProvided = tab === 'orders'
    || tab === 'stocks'
    || tab === 'create'
    || tab === 'detail'
    || ['dashboard', 'sawingCost', 'scanPrint', 'dataTools'].includes(definition.key)

  return (
    <PageModuleBoundary definition={definition} toolbarProvided={toolbarProvided}>
      {message && createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:left-auto sm:right-4 sm:top-20 sm:w-[min(32rem,calc(100vw-2rem))] sm:px-0">
          <div role="status" aria-live="polite" className={`w-full rounded-lg border p-4 text-sm shadow-xl ${
            message.includes('成功') || message.includes('完成') || message.includes('补齐')
              ? 'border-green-200 bg-green-100 text-green-700'
              : 'border-red-200 bg-red-100 text-red-700'
          }`}>
            {message}
          </div>
        </div>,
        document.body,
      )}

      {tab === 'dashboard' && (
        <DashboardPage
          items={workspaceItems}
          preference={workspacePreference}
          onOpen={onOpenWorkspaceFunction}
          onOpenAllFunctions={onOpenAllFunctions}
          onSave={onSaveWorkspacePreference}
        />
      )}

      {tab === 'allFunctions' && (
        <AllFunctionsPage
          items={workspaceItems}
          preference={workspacePreference}
          onOpen={onOpenWorkspaceFunction}
        />
      )}

      {(tab === 'orders' || tab === 'create' || tab === 'detail') && (
        <ProductionOrderModule
          mode={tab}
          canCreate={canCreate('orders')}
          onModeChange={onTabChange}
          onMessage={onMessage}
          onStateSummaryChange={onProductionOrderStateSummaryChange}
        />
      )}

      {tab === 'stocks' && (
        <StockPageModule
          operatorName={operator.name || operator.username}
          canUpdateStock={canUpdate('stocks')}
          onMessage={onMessage}
          onStateSummaryChange={onStockStateSummaryChange}
        />
      )}

      {tab === 'materials' && materialSection === 'materials' && (
        <MaterialPage
          onMessage={onMessage}
          showBomWorkspace={false}
          canReadBom={canRead('bomCost')}
          canCreateBom={canUpdate('bomCost')}
          onOpenBomWorkspace={(materialId) => onOpenBomEditor(materialId)}
        />
      )}
      {tab === 'materials' && materialSection === 'bomWorkspace' && (
        <MaterialPage
          onMessage={onMessage}
          showBomWorkspace
          openBomRequest={bomEditorTarget}
          onOpenBomRequestHandled={onBomEditorTargetHandled}
        />
      )}
      {tab === 'materials' && materialSection === 'bomUsage' && (
        <div className="min-w-0">
          <BomOverviewPage onMessage={onMessage} onOpenBom={onOpenBomEditor} />
        </div>
      )}

      {tab === 'workInstructions' && <WorkInstructionPage onMessage={onMessage} />}
      {tab === 'documentCategories' && (
        <DocumentCategorySettingsPage
          onMessage={onMessage}
          canUpdate={canUpdate('workInstructions')}
          canDelete={canDelete('workInstructions')}
        />
      )}
      {tab === 'equipment' && (
        <EquipmentPage
          onMessage={onMessage}
          canCreate={canCreate('equipment')}
          canUpdate={canUpdate('equipment')}
          canDelete={canDelete('equipment')}
        />
      )}
      {tab === 'materialIn' && <MaterialInPage onMessage={onMessage} />}
      {tab === 'dispatch' && <DispatchPage onMessage={onMessage} />}
      {tab === 'salesOrders' && <SalesOrderPage onMessage={onMessage} />}
      {tab === 'shipment' && <ShipmentPage onMessage={onMessage} />}
      {tab === 'return' && <ReturnPage onMessage={onMessage} />}
      {tab === 'flowTransfers' && <FlowTransferPage onMessage={onMessage} />}
      {tab === 'employees' && (
        <EmployeePage
          onMessage={onMessage}
          canCreate={canCreate('system')}
          canUpdate={canUpdate('system')}
        />
      )}
      {tab === 'sawingCost' && <SawingCostCalculatorPage />}
      {tab === 'scanPrint' && <ScanPrintPage onMessage={onMessage} />}
      {tab === 'operators' && <OperatorPage currentOperator={operator} onMessage={onMessage} />}
      {activeSystemSection && <SystemPage section={activeSystemSection} onMessage={onMessage} />}
      {tab === 'permissionUsers' && <PermissionPage mode="users" onMessage={onMessage} />}
      {tab === 'permissionGroups' && <PermissionPage mode="groups" onMessage={onMessage} />}
    </PageModuleBoundary>
  )
}
