'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import { ResourceAdvancedSearch } from '@/app/components/resource'
import { filterBySearchCatalog, type ResourceSearchCondition } from '@/lib/resource-search'
import { listBoms } from '../client'
import { useBomPagePreferences } from '../client/bom-page-preferences'
import type { BomMaterialOption, BomSearchRow, BomUnitCatalogItem, MaterialBom } from '../contracts'
import { bomMaterialIdOfProduct } from '../model/bom-material'
import { bomAdvancedSearchFields, bomSearchCatalog } from '../model/bom-search'
import BomWorkspace from './BomWorkspace'
import useBomDraftController from './useBomDraftController'

export default function BomWorkbenchPage({ loadUnits, onMessage, canCreate = false, canUpdate = false, canDelete = false }: {
  loadUnits: () => Promise<BomUnitCatalogItem[]>
  onMessage: (message: string) => void
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
}) {
  const [products, setProducts] = useState<MaterialBom[]>([])
  const [materials, setMaterials] = useState<BomMaterialOption[]>([])
  const [units, setUnits] = useState<BomUnitCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [conditions, setConditions] = useState<ResourceSearchCondition[]>([])
  const [preferences] = useBomPagePreferences()
  const initialized = useRef(false)
  const afterSave = useRef<(id?: string) => Promise<void>>()
  const onAfterSave = useCallback(async (id?: string) => { await afterSave.current?.(id) }, [])
  const controller = useBomDraftController({ products, materialOptions: materials, unitCatalog: units,
    preferredLengthUnit: preferences.lengthUnit, preferredWeightUnit: preferences.weightUnit, onMessage, onAfterSave })
  const selectExistingBom = controller.selectExistingBom
  const load = useCallback(async (preferredId?: string) => {
    setLoading(true)
    setError('')
    try {
      const [result, catalog] = await Promise.all([listBoms(), loadUnits()])
      setProducts(result.products)
      setMaterials(result.materialOptions)
      setUnits(catalog)
      if (!initialized.current) {
        initialized.current = true
        const owner = result.products.find(product => product.boms.length > 0)
        if (owner && !preferredId) selectExistingBom(bomMaterialIdOfProduct(owner), owner.boms[0].id)
      }
      if (preferredId) {
        const owner = result.products.find(product => product.boms.some(bom => bom.id === preferredId))
        if (owner) selectExistingBom(bomMaterialIdOfProduct(owner), preferredId)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '加载 BOM 失败'
      setError(message)
      onMessage(message)
    } finally { setLoading(false) }
  }, [onMessage, selectExistingBom, loadUnits])
  useEffect(() => { afterSave.current = load; return () => { afterSave.current = undefined } }, [load])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!controller.dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [controller.dirty])
  const rows = useMemo(() => {
    const byId = new Map(materials.map(material => [material.id, material]))
    const all: BomSearchRow[] = products.flatMap(product => product.boms.map(bom => {
      const materialId = bomMaterialIdOfProduct(product)
      return { product, bom, materialId, material: byId.get(materialId) || null }
    }))
    return filterBySearchCatalog(all, keyword, bomSearchCatalog, conditions)
  }, [products, materials, keyword, conditions])
  const canLeaveDraft = () => !controller.saving && (!controller.dirty || window.confirm('当前 BOM 有未保存的修改，确定放弃吗？'))
  return <div className="space-y-4">
    <ResponsiveToolbarActions pageKey="bomWorkbench"
      primaryFilters={<SearchFieldWithPresets storageKey="mes-lite.searchPresets.boms" value={keyword} onChange={setKeyword}
        placeholder="搜索产出、投入物料、BOM 或版本" conditions={conditions} onConditionsChange={setConditions} />}
      advancedSearch={<ResourceAdvancedSearch fields={bomAdvancedSearchFields} conditions={conditions} onChange={setConditions} />}
      actions={<>
        <AppButton disabled={loading || controller.saving} onClick={() => { if (canLeaveDraft()) void load() }}>刷新</AppButton>
        {canCreate && <AppButton variant="create" disabled={loading || !!error || controller.saving} onClick={() => { if (canLeaveDraft()) controller.selectMaterialForBom('') }}>新建 BOM</AppButton>}
      </>} />
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}，请点击刷新重试。</div> :
      <BomWorkspace rows={rows} loading={loading} keyword={keyword} controller={controller}
        selectedMaterialId={controller.selectedMaterialId} selectedBomId={controller.selectedBomId}
        canCreateBom={canCreate && !loading} canUpdateBom={canUpdate && !loading} canDeleteBom={canDelete && !loading}
        onSelectBom={(materialId, bomId) => { if (canLeaveDraft()) controller.selectExistingBom(materialId, bomId) }} />}
  </div>
}
