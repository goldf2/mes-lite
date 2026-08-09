'use client'

import { ReactNode, useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { getMultiSelectQuery } from '@/app/components/StatusCheckboxFilter'
import TopBarPortal from '@/app/components/TopBarPortal'
import { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import MaterialPanoramaPage from './MaterialPanoramaPage'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import AppButton from '@/app/components/AppButton'
import { useBomPagePreferences } from '@/app/components/bomPagePreferences'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import {
  filterByResourceSearch,
  type ResourceAdvancedSearchField,
  type ResourceSearchCondition,
  type ResourceSearchProfile,
} from '@/lib/resource-search'
import type {
  BomItem,
  BomMaterialOption,
  BomSearchRow,
  MaterialBom,
} from '@/modules/bom'
import {
  BomApiError,
  BomDraftEditor,
  bomMaterialIdOfProduct,
  listBoms,
  useBomDraftController,
} from '@/modules/bom'
import type { ConfiguredUnit, CustomerOption, Material, PaginationState } from '../contracts'
import {
  MaterialApiError,
  archiveMaterial,
  downloadMaterialFile,
  listConfiguredUnits,
  listMaterialCustomers,
  listMaterials,
} from '../client'
import MaterialEditDialog from './MaterialEditDialog'
import MaterialDetailDialog from './MaterialDetailDialog'
import MaterialCardView from './MaterialCardView'
import MaterialImportDialog from './MaterialImportDialog'
import MaterialPageOptions from './MaterialPageOptions'
import MaterialPagination from './MaterialPagination'
import MaterialTableView from './MaterialTableView'
import MaterialBomWorkspace from './MaterialBomWorkspace'
import MaterialWorkspaceToolbar from './MaterialWorkspaceToolbar'
import useMaterialViewPreferences from './useMaterialViewPreferences'
import {
  materialCategoryFilterOptions,
  materialCategoryLabels,
} from '../model/material-options'
import { type MaterialSortBy, type SortDirection } from '../model/material-view'

const bomSearchProfile: ResourceSearchProfile<BomSearchRow> = {
  key: 'boms',
  keywordFields: [
    { key: 'output', label: '产出物料', read: ({ product, bom, material }) => [product.sku, product.name, material?.code, material?.name, material?.spec, ...bom.outputs.flatMap((output) => [output.material.code, output.material.name, output.material.spec])].filter(Boolean).join(' ') },
    { key: 'input', label: '投入物料', read: ({ bom }) => bom.items.flatMap((item) => [item.material?.code, item.material?.name, item.material?.spec]).filter(Boolean).join(' ') },
    { key: 'name', label: 'BOM 名称', read: ({ product, bom }) => `${product.description || ''} ${bom.name}` },
    { key: 'version', label: '版本', read: ({ bom }) => bom.version },
  ],
}

const bomAdvancedSearchFields: readonly ResourceAdvancedSearchField<BomSearchRow>[] = [
  { key: 'output', label: '产出物料', type: 'text', read: ({ product, bom, material }) => [product.sku, product.name, material?.code, material?.name, material?.spec, ...bom.outputs.flatMap((output) => [output.material.code, output.material.name, output.material.spec])].filter(Boolean).join(' ') },
  { key: 'input', label: '投入物料', type: 'text', read: ({ bom }) => bom.items.flatMap((item) => [item.material?.code, item.material?.name, item.material?.spec]).filter(Boolean).join(' ') },
  { key: 'name', label: 'BOM 名称', type: 'text', read: ({ bom }) => bom.name },
  { key: 'version', label: '版本', type: 'text', read: ({ bom }) => bom.version },
  { key: 'purpose', label: '用途', type: 'select', read: ({ bom }) => bom.purpose, options: [{ value: 'PRODUCTION', label: '生产 BOM' }, { value: 'PACKAGING', label: '包装 BOM' }] },
  { key: 'status', label: '启用状态', type: 'select', read: ({ bom }) => bom.isActive ? 'active' : 'inactive', options: [{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }] },
  { key: 'default', label: '默认方案', type: 'select', read: ({ bom }) => bom.isDefault ? 'default' : 'other', options: [{ value: 'default', label: '默认 BOM' }, { value: 'other', label: '非默认 BOM' }] },
]

const bomStatusOptions = [
  { value: 'all', label: '全部 BOM 状态' },
  { value: 'NONE', label: '未建立产出 BOM' },
  { value: 'NO_ACTIVE', label: '有 BOM 但无启用方案' },
  { value: 'NO_DEFAULT', label: '有启用方案但无默认方案' },
  { value: 'READY', label: '已有可用默认 BOM' },
] as const
type BomStatusFilter = (typeof bomStatusOptions)[number]['value']
const bomWorkspaceStateStorageKey = 'mes-lite.boms.workspaceState'

function qty(value: number, digits = 6) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

export default function MaterialPage({
  onMessage,
  onToolbarChange,
  showBomWorkspace = false,
  openBomRequest,
  onOpenBomRequestHandled,
  onOpenBomWorkspace,
  canReadBom = false,
  canCreateBom = false,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
  showBomWorkspace?: boolean
  openBomRequest?: { materialId: string; bomId?: string; requestId: number } | null
  onOpenBomRequestHandled?: () => void
  onOpenBomWorkspace?: (materialId: string) => void
  canReadBom?: boolean
  canCreateBom?: boolean
}) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [bomProducts, setBomProducts] = useState<MaterialBom[]>([])
  const [bomMaterialOptions, setBomMaterialOptions] = useState<BomMaterialOption[]>([])
  const [unitCatalog, setUnitCatalog] = useState<ConfiguredUnit[]>([])
  const [bomPagePreferences] = useBomPagePreferences()
  const [bomLoading, setBomLoading] = useState(false)
  const [bomDataReady, setBomDataReady] = useState(false)
  const [quickBomMaterialId, setQuickBomMaterialId] = useState<string | null>(null)
  const [quickBomDraftReady, setQuickBomDraftReady] = useState(false)
  const [bomKeyword, setBomKeyword] = useState('')
  const [bomSearchConditions, setBomSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [keyword, setKeyword] = useState('')
  const [materialSearchConditions, setMaterialSearchConditions] = useState<ResourceSearchCondition[]>([])
  const [sortBy, setSortBy] = useState<MaterialSortBy>('createdAt')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [showModal, setShowModal] = useState(false)
  const [showPageOptions, setShowPageOptions] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [detailMaterial, setDetailMaterial] = useState<Material | null>(null)
  const [panoramaMaterialId, setPanoramaMaterialId] = useState<string | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materials.viewMode', 'list')
  const viewPreferences = useMaterialViewPreferences()
  const {
    visibleFields,
    bomSummaryVisible,
    bomSummaryFields,
    columnControls,
  } = viewPreferences
  const afterBomSaveRef = useRef<(preferredBomId?: string) => Promise<void>>()
  const handleAfterBomSave = useCallback(async (preferredBomId?: string) => {
    await afterBomSaveRef.current?.(preferredBomId)
  }, [])
  const bomDraft = useBomDraftController({
    products: bomProducts,
    materialOptions: bomMaterialOptions,
    unitCatalog,
    preferredLengthUnit: bomPagePreferences.lengthUnit,
    preferredWeightUnit: bomPagePreferences.weightUnit,
    onMessage,
    onAfterSave: handleAfterBomSave,
  })
  const {
    productByMaterialId: bomProductByMaterialId,
    materialById: bomMaterialById,
    selectedMaterialId,
    selectedBomId,
    selectedMaterial,
    selectedBom,
    dirty: draftBomDirty,
    saving: bomSaving,
    selectMaterialForBom,
    selectExistingBom,
  } = bomDraft
  const bomWorkspaceStateRestoredRef = useRef(false)
  const handledBomOpenRequestRef = useRef<number | null>(null)
  const canUseBomData = showBomWorkspace || canReadBom
  const selectedCategory = materialSearchConditions.find((condition) => condition.field === 'category')?.value || ''
  const selectedCategories = useMemo(
    () => selectedCategory ? [selectedCategory] : materialCategoryFilterOptions.map((option) => option.value),
    [selectedCategory],
  )
  const customerFilter = materialSearchConditions.find((condition) => condition.field === 'customerId')?.value || ''
  const selectedBomStatus = materialSearchConditions.find((condition) => condition.field === 'bomStatus')?.value || 'all'
  const bomStatusFilter: BomStatusFilter = bomStatusOptions.some((option) => option.value === selectedBomStatus)
    ? selectedBomStatus as BomStatusFilter
    : 'all'
  const materialAdvancedSearchFields = useMemo<readonly ResourceAdvancedSearchField<Material>[]>(() => {
    const fields: ResourceAdvancedSearchField<Material>[] = [
      { key: 'code', label: '物料编码', type: 'text', read: (material) => material.code },
      { key: 'name', label: '物料名称', type: 'text', read: (material) => material.name },
      { key: 'spec', label: '规格', type: 'text', read: (material) => material.spec },
      { key: 'category', label: '物料分类', type: 'select', read: (material) => material.category, options: materialCategoryFilterOptions },
      { key: 'customerId', label: '归属客户', type: 'select', read: (material) => material.customerId || '__UNASSIGNED__', options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
      { key: 'primaryMeasure', label: '主计量方式', type: 'select', read: (material) => material.primaryMeasure, options: [{ value: 'LENGTH', label: '长度' }, { value: 'WEIGHT', label: '重量' }, { value: 'QUANTITY', label: '数量' }, { value: 'OTHER', label: '其他' }] },
      { key: 'stockUnit', label: '库存单位', type: 'text', read: (material) => material.stockUnit },
      { key: 'valuationUnit', label: '计价单位', type: 'text', read: (material) => material.valuationUnit },
      { key: 'costingMethod', label: '计价方法', type: 'select', read: (material) => material.costingMethod, options: [{ value: 'WEIGHTED_AVERAGE', label: '加权平均' }, { value: 'FIFO', label: '先进先出' }] },
      { key: 'note', label: '备注', type: 'text', read: (material) => material.note },
      { key: 'createdAt', label: '创建日期', type: 'date', read: (material) => material.createdAt },
    ]
    if (canUseBomData) fields.splice(9, 0, { key: 'bomStatus', label: 'BOM 状态', type: 'select', read: () => '', options: bomStatusOptions.filter((option) => option.value !== 'all') })
    return fields
  }, [canUseBomData, customers])
  const existingBomRows = useMemo(() => {
    const rows: BomSearchRow[] = bomProducts.flatMap((product) => product.boms.map((bom) => {
      const materialId = bomMaterialIdOfProduct(product)
      return {
        product,
        bom,
        materialId,
        material: bomMaterialById.get(materialId) || null,
      }
    }))
    return filterByResourceSearch(rows, bomKeyword, bomSearchProfile, bomAdvancedSearchFields, bomSearchConditions)
  }, [bomKeyword, bomMaterialById, bomProducts, bomSearchConditions])
  const fetchBomData = useCallback(async (preferredBomId?: string) => {
    setBomLoading(true)
    setBomDataReady(false)
    try {
      const result = await listBoms()
      setBomProducts(result.products)
      setBomMaterialOptions(result.materialOptions)
      if (preferredBomId) {
        const targetProduct = result.products.find((product) => product.boms.some((bom) => bom.id === preferredBomId))
        if (targetProduct) {
          selectExistingBom(bomMaterialIdOfProduct(targetProduct), preferredBomId)
        }
      }
    } catch (error) {
      onMessage(error instanceof BomApiError ? error.message : '获取 BOM 关系失败')
    } finally {
      setBomLoading(false)
      setBomDataReady(true)
    }
  }, [onMessage, selectExistingBom])

  useEffect(() => {
    afterBomSaveRef.current = fetchBomData
    return () => {
      afterBomSaveRef.current = undefined
    }
  }, [fetchBomData])

  useEffect(() => {
    if (!showBomWorkspace) fetchMaterials()
  }, [keyword, selectedCategories, customerFilter, bomStatusFilter, materialSearchConditions, sortBy, sortDir, page, pageSize, showBomWorkspace])

  useEffect(() => {
    setPage(1)
  }, [keyword, selectedCategories, customerFilter, bomStatusFilter, materialSearchConditions, sortBy, sortDir, pageSize])

  useEffect(() => {
    fetchCustomers()
    fetchUnitCatalog()
    if (canUseBomData && (showBomWorkspace || bomSummaryVisible)) fetchBomData()
  }, [bomSummaryVisible, canUseBomData, fetchBomData, showBomWorkspace])

  const buildMaterialParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    if (keyword) params.set('keyword', keyword)
    if (customerFilter) params.set('customerId', customerFilter)
    if (canUseBomData && bomStatusFilter !== 'all') params.set('bomStatus', bomStatusFilter)
    if (materialSearchConditions.length > 0) {
      params.set('advanced', JSON.stringify(materialSearchConditions.map(({ field, operator, value }) => ({ field, operator, value }))))
    }
    const categoryQuery = getMultiSelectQuery('categories', selectedCategories, materialCategoryFilterOptions)
    if (categoryQuery) {
      const categoryParams = new URLSearchParams(categoryQuery)
      categoryParams.forEach((value, key) => params.set(key, value))
    }
    return params
  }

  const fetchMaterials = async () => {
    try {
      const result = await listMaterials(buildMaterialParams())
      const nextPagination = result.pagination || { page, pageSize, total: result.materials.length, totalPages: 1 }
      setMaterials(result.materials)
      setPagination(nextPagination)
      if (nextPagination.total > 0 && nextPagination.page > nextPagination.totalPages) {
        setPage(nextPagination.totalPages)
      }
      setDetailMaterial((current) => current ? result.materials.find((item) => item.id === current.id) || current : null)
    } catch (error) {
      onMessage(error instanceof MaterialApiError ? error.message : '获取物料失败')
    }
  }

  const refreshMaterialSources = async () => {
    const tasks: Promise<unknown>[] = [fetchMaterials()]
    if (canUseBomData) tasks.push(fetchBomData())
    await Promise.allSettled(tasks)
  }

  const downloadFile = async (url: string) => {
    try {
      await downloadMaterialFile(url)
    } catch (error) {
      onMessage(error instanceof MaterialApiError ? error.message : '下载失败')
    }
  }

  const handleExport = () => {
    const params = buildMaterialParams()
    const url = params.toString() ? `/api/materials/export?${params.toString()}` : '/api/materials/export'
    downloadFile(url)
  }

  const handleDownloadTemplate = () => {
    downloadFile('/api/materials/import-template')
  }

  const openImportModal = () => {
    setShowImportModal(true)
  }

  const fetchCustomers = async () => {
    try {
      setCustomers(await listMaterialCustomers())
    } catch {
      // ignore
    }
  }

  const fetchUnitCatalog = async () => {
    try {
      setUnitCatalog(await listConfiguredUnits())
    } catch {
      // 物料列表仍可读取；编辑时会保留现有旧单位。
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm('确定要归档该物料吗？归档后不会在物料列表中显示，可在归档记录中恢复。')) return
    try {
      onMessage(await archiveMaterial(id))
      await refreshMaterialSources()
    } catch (error) {
      onMessage(error instanceof MaterialApiError ? error.message : '归档失败')
    }
  }

  const handleEdit = (material: Material) => {
    setEditingMaterial(material)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingMaterial(null)
    setShowModal(true)
  }

  const handleViewDetail = (material: Material) => setDetailMaterial(material)

  const handleOpenPanorama = (material: Material) => {
    setPanoramaMaterialId(material.id)
  }

  const getMaterialBomProduct = (material: Material) => bomProductByMaterialId.get(material.id) || null

  const getBomSummary = (material: Material) => {
    const product = getMaterialBomProduct(material)
    const componentItems = product?.bom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
    const usageItems = bomProducts.flatMap((usageProduct) => (usageProduct.bom?.items || [])
      .filter((item) => item.itemType === 'MATERIAL' && item.material?.id === material.id)
      .map((item) => ({ product: usageProduct, item })))
    const selected = new Set(bomSummaryFields)
    const componentText = (item: BomItem) => {
      const parts: string[] = []
      if (selected.has('name')) parts.push(item.material?.name || '物料')
      if (selected.has('spec') && item.material?.spec) parts.push(item.material.spec)
      if (selected.has('code')) parts.push(item.material?.code || '')
      const relation = parts.filter(Boolean).join(' · ')
      return Number(item.quantity) > 0 ? `${relation}（每批 ${qty(Number(item.quantity))} ${item.unit}）` : relation
    }
    const usageText = ({ product: usageProduct, item }: { product: MaterialBom; item: BomItem }) => {
      const parts: string[] = []
      if (selected.has('name')) parts.push(usageProduct.name)
      if (selected.has('spec') && usageProduct.description) parts.push(usageProduct.description)
      if (selected.has('code')) parts.push(usageProduct.sku)
      return parts.filter(Boolean).join(' · ')
    }
    const sections: string[] = []
    if (componentItems.length > 0) {
      sections.push(`组成：${componentItems.slice(0, 2).map(componentText).join('，')}`)
    }
    if (usageItems.length > 0) {
      sections.push(`用于：${usageItems.slice(0, 2).map(usageText).join('，')}`)
    }
    return {
      count: componentItems.length + usageItems.length,
      componentCount: componentItems.length,
      usageCount: new Set(usageItems.map(({ product: usageProduct }) => usageProduct.id)).size,
      text: sections.join('；') || '无 BOM 关联',
    }
  }

  const openQuickBomCreate = useCallback((materialId: string) => {
    setQuickBomMaterialId(materialId)
    setQuickBomDraftReady(false)
    if (!bomDataReady && !bomLoading) void fetchBomData()
  }, [bomDataReady, bomLoading, fetchBomData])

  const closeQuickBomCreate = useCallback(() => {
    if (bomSaving) return
    setQuickBomMaterialId(null)
    setQuickBomDraftReady(false)
  }, [bomSaving])

  useEffect(() => {
    if (showBomWorkspace || !quickBomMaterialId || quickBomDraftReady || !bomDataReady) return
    if (!bomMaterialById.has(quickBomMaterialId)) {
      onMessage('目标物料不存在或已归档')
      setQuickBomMaterialId(null)
      return
    }
    selectMaterialForBom(quickBomMaterialId)
    setQuickBomDraftReady(true)
  }, [bomDataReady, bomMaterialById, onMessage, quickBomDraftReady, quickBomMaterialId, selectMaterialForBom, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || !bomDataReady || !openBomRequest) return
    if (handledBomOpenRequestRef.current === openBomRequest.requestId) return
    handledBomOpenRequestRef.current = openBomRequest.requestId
    bomWorkspaceStateRestoredRef.current = true
    if (!openBomRequest.bomId) {
      if (!bomMaterialById.has(openBomRequest.materialId)) {
        onMessage('目标物料不存在或已归档')
        onOpenBomRequestHandled?.()
        return
      }
      selectMaterialForBom(openBomRequest.materialId)
      onOpenBomRequestHandled?.()
      return
    }
    const product = bomProductByMaterialId.get(openBomRequest.materialId)
    if (!product?.boms.some((bom) => bom.id === openBomRequest.bomId)) {
      onMessage('目标 BOM 不存在或已归档')
      onOpenBomRequestHandled?.()
      return
    }
    selectExistingBom(openBomRequest.materialId, openBomRequest.bomId)
    onOpenBomRequestHandled?.()
  }, [bomDataReady, bomMaterialById, bomProductByMaterialId, onMessage, onOpenBomRequestHandled, openBomRequest, selectExistingBom, selectMaterialForBom, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || !bomDataReady || bomWorkspaceStateRestoredRef.current) return
    bomWorkspaceStateRestoredRef.current = true
    try {
      const saved = JSON.parse(window.localStorage.getItem(bomWorkspaceStateStorageKey) || '{}') as {
        materialId?: string
        bomId?: string
      }
      if (!saved.materialId || !saved.bomId) return
      const product = bomProductByMaterialId.get(saved.materialId)
      if (!product?.boms.some((bom) => bom.id === saved.bomId)) return
      selectExistingBom(saved.materialId, saved.bomId)
    } catch (error) {
      window.localStorage.removeItem(bomWorkspaceStateStorageKey)
    }
  }, [bomDataReady, bomProductByMaterialId, selectExistingBom, showBomWorkspace])

  useEffect(() => {
    if (!showBomWorkspace || !bomWorkspaceStateRestoredRef.current) return
    window.localStorage.setItem(bomWorkspaceStateStorageKey, JSON.stringify({
      materialId: selectedBomId && selectedBomId !== '__new__' ? selectedMaterialId : undefined,
      bomId: selectedBomId && selectedBomId !== '__new__' ? selectedBomId : undefined,
    }))
  }, [selectedBomId, selectedMaterialId, showBomWorkspace])

  const saveQuickBom = async () => {
    const saved = await bomDraft.save()
    if (!saved) return
    setQuickBomMaterialId(null)
    setQuickBomDraftReady(false)
  }

  const openFullBomEditorFromQuickCreate = () => {
    if (!quickBomMaterialId || !onOpenBomWorkspace || bomSaving) return
    const materialId = quickBomMaterialId
    setQuickBomMaterialId(null)
    setQuickBomDraftReady(false)
    onOpenBomWorkspace(materialId)
  }

  const handleHeaderSort = (field: MaterialSortBy) => {
    if (sortBy === field) {
      setSortDir((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  const applyMaterialSearchConditions = useCallback((conditions: ResourceSearchCondition[]) => {
    setMaterialSearchConditions(conditions)
    setPage(1)
  }, [])

  const renderToolbar = () => (
    <MaterialWorkspaceToolbar
      showBomWorkspace={showBomWorkspace}
      bomKeyword={bomKeyword}
      onBomKeywordChange={setBomKeyword}
      bomConditions={bomSearchConditions}
      onBomConditionsChange={setBomSearchConditions}
      bomFields={bomAdvancedSearchFields}
      materialKeyword={keyword}
      onMaterialKeywordChange={setKeyword}
      materialConditions={materialSearchConditions}
      onMaterialConditionsChange={applyMaterialSearchConditions}
      materialFields={materialAdvancedSearchFields}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onOpenPageOptions={() => setShowPageOptions(true)}
      onNewBom={() => selectMaterialForBom('')}
      onNewMaterial={handleAdd}
      onImport={openImportModal}
      onExport={handleExport}
    />
  )

  useEffect(() => {
    if (!onToolbarChange) return
    onToolbarChange(renderToolbar())
    return () => onToolbarChange(null)
    // 工具栏由当前两种页面形态及其筛选状态驱动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onToolbarChange, keyword, viewMode, showBomWorkspace, bomKeyword, bomSearchConditions, materialAdvancedSearchFields, materialSearchConditions])

  return (
    <>
      <TopBarPortal>
        {renderToolbar()}
      </TopBarPortal>
      <MaterialPageOptions
        open={showPageOptions}
        onClose={() => setShowPageOptions(false)}
        showBomWorkspace={showBomWorkspace}
        canUseBomData={canUseBomData}
        viewMode={viewMode}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirectionToggle={() => setSortDir((current) => current === 'asc' ? 'desc' : 'asc')}
        onMessage={onMessage}
        preferences={viewPreferences}
      />
      <div className="min-w-0">
        {!showBomWorkspace && (
        <div
          className="min-w-0 rounded-lg bg-transparent p-0 shadow-none sm:bg-white sm:p-4 sm:shadow"
        >
          {materials.length === 0 ? (
          <div className="rounded-lg bg-white py-10 text-center text-gray-500 shadow sm:bg-transparent sm:py-12 sm:shadow-none">
            <p>暂无物料</p>
            <button
              onClick={handleAdd}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              创建第一个物料
            </button>
          </div>
        ) : viewMode === 'card' ? (
          <>
            <MaterialCardView
              materials={materials}
              visibleFields={visibleFields}
              showBomSummary={canUseBomData && bomSummaryVisible}
              canCreateBom={canCreateBom}
              getBomSummary={getBomSummary}
              actions={{
                onCreateBom: openQuickBomCreate,
                onOpenPanorama: handleOpenPanorama,
                onViewDetail: handleViewDetail,
                onArchive: handleArchive,
              }}
            />
            <MaterialPagination
              pagination={pagination}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : (
          <>
            <MaterialTableView
              materials={materials}
              visibleFields={visibleFields}
              showBomSummary={canUseBomData && bomSummaryVisible}
              canCreateBom={canCreateBom}
              getBomSummary={getBomSummary}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleHeaderSort}
              columns={columnControls}
              actions={{
                onCreateBom: openQuickBomCreate,
                onOpenPanorama: handleOpenPanorama,
                onViewDetail: handleViewDetail,
                onArchive: handleArchive,
              }}
            />
            <MaterialPagination
              pagination={pagination}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
          )}
        </div>
        )}

        {showBomWorkspace && (
          <MaterialBomWorkspace
            rows={existingBomRows}
            loading={bomLoading}
            keyword={bomKeyword}
            selectedMaterialId={selectedMaterialId}
            selectedBomId={selectedBomId}
            controller={bomDraft}
            onSelectBom={selectExistingBom}
          />
        )}
      </div>

      {quickBomMaterialId && (
        <ModalDialog
          title="快速创建 BOM"
          description={quickBomDraftReady && selectedMaterial
            ? `${selectedMaterial.code} · ${selectedMaterial.name} 已作为主产出`
            : '正在准备当前物料的 BOM 草稿...'}
          headerActions={onOpenBomWorkspace && quickBomDraftReady ? (
            <AppButton variant="secondary" onClick={openFullBomEditorFromQuickCreate} disabled={bomSaving}>
              完整 BOM 设置
            </AppButton>
          ) : undefined}
          onClose={closeQuickBomCreate}
          closeDisabled={bomSaving}
          size="wide"
          bodyClassName="bg-gray-50/40"
          footer={(
            <ModalActions
              onCancel={closeQuickBomCreate}
              onConfirm={saveQuickBom}
              cancelLabel="取消"
              confirmLabel="保存 BOM"
              disabled={!quickBomDraftReady || !selectedMaterial || !draftBomDirty}
              busy={bomSaving}
            />
          )}
        >
          {quickBomDraftReady ? (
            <BomDraftEditor controller={bomDraft} />
          ) : (
            <AppLoadingIndicator compact label="正在加载 BOM 数据..." />
          )}
        </ModalDialog>
      )}

      <MaterialEditDialog
        open={showModal}
        material={editingMaterial}
        customers={customers}
        unitCatalog={unitCatalog}
        onClose={() => {
          setShowModal(false)
          setEditingMaterial(null)
        }}
        onMessage={onMessage}
        onSaved={async () => {
          setPage(1)
          await refreshMaterialSources()
        }}
      />

      <MaterialImportDialog
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onMessage={onMessage}
        onDownloadTemplate={handleDownloadTemplate}
        onImported={async () => {
          setPage(1)
          await refreshMaterialSources()
        }}
      />
      <MaterialDetailDialog
        key={detailMaterial?.id || 'closed'}
        material={detailMaterial}
        onClose={() => setDetailMaterial(null)}
        onEdit={(material) => {
          setDetailMaterial(null)
          handleEdit(material)
        }}
        onOpenPanorama={handleOpenPanorama}
        onMessage={onMessage}
        onAttachmentsChanged={fetchMaterials}
      />

      {panoramaMaterialId && (
        <MaterialPanoramaPage
          materialId={panoramaMaterialId}
          onClose={() => setPanoramaMaterialId(null)}
          onMessage={onMessage}
        />
      )}
    </>
  )
}
