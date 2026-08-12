import AppButton from '@/app/components/AppButton'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import ViewModeToggle, { type ViewMode } from '@/app/components/ViewModeToggle'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import type { ResourceAdvancedSearchField, ResourceSearchCondition } from '@/lib/resource-search'
import type { BomSearchRow } from '@/modules/bom'
import type { Material } from '../contracts'

export default function MaterialWorkspaceToolbar({
  showBomWorkspace,
  bomKeyword,
  onBomKeywordChange,
  bomConditions,
  onBomConditionsChange,
  bomFields,
  materialKeyword,
  onMaterialKeywordChange,
  materialConditions,
  onMaterialConditionsChange,
  materialFields,
  viewMode,
  onViewModeChange,
  onOpenPageOptions,
  onNewBom,
  onNewMaterial,
  onImport,
  onExport,
}: {
  showBomWorkspace: boolean
  bomKeyword: string
  onBomKeywordChange: (value: string) => void
  bomConditions: ResourceSearchCondition[]
  onBomConditionsChange: (conditions: ResourceSearchCondition[]) => void
  bomFields: readonly ResourceAdvancedSearchField<BomSearchRow>[]
  materialKeyword: string
  onMaterialKeywordChange: (value: string) => void
  materialConditions: ResourceSearchCondition[]
  onMaterialConditionsChange: (conditions: ResourceSearchCondition[]) => void
  materialFields: readonly ResourceAdvancedSearchField<Material>[]
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  onOpenPageOptions: () => void
  onNewBom: () => void
  onNewMaterial: () => void
  onImport: () => void
  onExport: () => void
}) {
  if (showBomWorkspace) {
    return (
      <ResponsiveToolbarActions
        pageKey="bomWorkspace"
        primaryFilters={(
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.boms"
            value={bomKeyword}
            onChange={onBomKeywordChange}
            placeholder="搜索产出、投入物料、BOM 或版本"
            conditions={bomConditions}
            onConditionsChange={onBomConditionsChange}
            conditionLabel={`${bomConditions.length} 个 BOM 条件`}
          />
        )}
        advancedSearch={<ResourceAdvancedSearch fields={bomFields} conditions={bomConditions} onChange={onBomConditionsChange} />}
        onOpenPageOptions={onOpenPageOptions}
        actions={<AppButton variant="create" onClick={onNewBom}>新建 BOM</AppButton>}
      />
    )
  }

  return (
    <ResponsiveToolbarActions
      pageKey="materialManagement"
      primaryFilters={(
        <SearchFieldWithPresets
          storageKey="mes-lite.searchPresets.materials"
          value={materialKeyword}
          onChange={onMaterialKeywordChange}
          placeholder="搜索物料名称或编码"
          submitMode="explicit"
          conditions={materialConditions}
          onConditionsChange={onMaterialConditionsChange}
          conditionLabel={`${materialConditions.length} 个精确条件`}
        />
      )}
      advancedSearch={<ResourceAdvancedSearch fields={materialFields} conditions={materialConditions} onChange={onMaterialConditionsChange} />}
      viewControl={<ViewModeToggle value={viewMode} onChange={onViewModeChange} />}
      onOpenPageOptions={onOpenPageOptions}
      actions={(
        <>
          <AppButton variant="create" onClick={onNewMaterial}>新建物料</AppButton>
          <AppButton onClick={onImport}>导入</AppButton>
          <AppButton onClick={onExport}>导出</AppButton>
        </>
      )}
    />
  )
}
