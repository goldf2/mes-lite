'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import { normalizeMaterialInPriceUnit } from '@/lib/material-in-quantity'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from '@/modules/business-documents'
import {
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/modules/attachments'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'

import type {
  CustomerOption as Customer,
  InventoryLocationOption as InventoryLocation,
  MaterialInConversionHistory,
  MaterialInDraftItem,
  MaterialInRecord as MaterialIn,
  ReceivingMaterialOption as Material,
  SupplierOption as Supplier,
} from '../contracts/material-in'
import {
  createEmptyMaterialInForm,
  formatReceivingMaterialLabel as formatMaterialLabel,
  materialInStatusLabels as statusLabels,
  materialInStatusOptions as statusOptions,
} from '../model/material-in-view'
import MaterialInCollectionView from './MaterialInCollectionView'
import MaterialInDetailDialog from './MaterialInDetailDialog'
import MaterialInEditorDialog from './MaterialInEditorDialog'
import {
  listMaterialInRecords,
  listReceivingCustomers,
  getMaterialInConversionHistory,
  listReceivingLocations,
  listReceivingMaterials,
  listReceivingSuppliers,
  receiveMaterialInRecord,
  rejectMaterialInRecord,
  reverseMaterialInRecord,
  saveMaterialInRecord,
} from '../client/material-in-api'

export default function MaterialInPage({
  onMessage,
  onToolbarChange,
}: {
  onMessage: (msg: string) => void
  onToolbarChange?: (actions: ReactNode | null) => void
}) {
  const [materialIns, setMaterialIns] = useState<MaterialIn[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState(statusOptions.map((option) => option.value))
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [draftAttachmentOwnerId, setDraftAttachmentOwnerId] = useState('')
  const [draftAttachmentBusy, setDraftAttachmentBusy] = useState(false)
  const [editingItem, setEditingItem] = useState<MaterialIn | null>(null)
  const [detailItem, setDetailItem] = useState<MaterialIn | null>(null)
  const [draftItems, setDraftItems] = useState<MaterialInDraftItem[]>([])
  const [conversionHistory, setConversionHistory] = useState<MaterialInConversionHistory | null>(null)
  const [conversionHistoryLoading, setConversionHistoryLoading] = useState(false)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materialIn.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '归属客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'supplierId', label: '供应商', value: selectedSupplierId, onChange: setSelectedSupplierId, options: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })) },
  ], [customers, selectedCustomerId, selectedStatuses, selectedSupplierId, suppliers])

  const [form, setForm] = useState(createEmptyMaterialInForm)
  const selectedMaterial = materials.find((material) => material.id === form.materialId)
  const materialInSort = useClientTableSort(materialIns, {
    inboundNo: (item) => item.inboundNo,
    voucherNo: (item) => item.voucherNo,
    supplier: (item) => item.supplier?.name,
    material: (item) => item.items.map((line) => `${line.material.code} ${line.material.name}`).join(' '),
    location: (item) => `${item.location.code} ${item.location.name}`,
    totalAmount: (item) => item.totalAmount,
    status: (item) => statusLabels[item.status] || item.status,
    inboundDate: (item) => new Date(item.inboundDate),
  }, 'inboundDate', 'desc')

  useEffect(() => {
    fetchMaterialIns()
    fetchSuppliers()
    fetchCustomers()
    fetchMaterials()
    fetchLocations()
  }, [keyword, selectedStatuses, selectedSupplierId, selectedCustomerId])

  useEffect(() => {
    let cancelled = false
    const usesAuxiliaryUnit = Boolean(
      selectedMaterial?.referenceMeasure
        && selectedMaterial.referenceMeasure !== selectedMaterial.primaryMeasure
        && selectedMaterial.valuationUnit !== selectedMaterial.stockUnit,
    )
    if (!selectedMaterial || !usesAuxiliaryUnit) {
      setConversionHistory(null)
      setConversionHistoryLoading(false)
      return () => { cancelled = true }
    }

    setConversionHistory(null)
    setConversionHistoryLoading(true)
    void getMaterialInConversionHistory(selectedMaterial.id)
      .then(({ data }) => {
        if (!cancelled) setConversionHistory(data)
      })
      .catch(() => {
        if (!cancelled) setConversionHistory(null)
      })
      .finally(() => {
        if (!cancelled) setConversionHistoryLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedMaterial?.id, selectedMaterial?.referenceMeasure, selectedMaterial?.primaryMeasure, selectedMaterial?.valuationUnit, selectedMaterial?.stockUnit])

  const fetchLocations = async () => {
    try {
      const { data: options } = await listReceivingLocations()
      setLocations(options)
      setForm((current) => current.locationId ? current : {
        ...current,
        locationId: options.find((item: InventoryLocation) => item.isDefault)?.id || options[0]?.id || '',
      })
    } catch {
      // 由提交接口兜底使用默认库位
    }
  }

  const fetchMaterialIns = async () => {
    setLoading(true)
    try {
      const query = getStatusQuery(selectedStatuses, statusOptions)
      const params = new URLSearchParams(query)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (selectedSupplierId) params.set('supplierId', selectedSupplierId)
      if (selectedCustomerId) params.set('customerId', selectedCustomerId)
      const { data } = await listMaterialInRecords(params)
      setMaterialIns(data)
    } catch (err) {
      onMessage('获取来料单列表失败')
    }
    setLoading(false)
  }

  const fetchCustomers = async () => {
    try {
      const { data } = await listReceivingCustomers()
      setCustomers(data)
    } catch (err) {
      // ignore
    }
  }

  const fetchSuppliers = useCallback(async (searchKeyword = '') => {
    try {
      const { data } = await listReceivingSuppliers(searchKeyword)
      setSuppliers((current) => {
        const merged = new Map(current.map((supplier) => [supplier.id, supplier]))
        for (const supplier of data) merged.set(supplier.id, supplier)
        return Array.from(merged.values())
      })
    } catch (err) {
      // ignore
    }
  }, [])

  const fetchMaterials = useCallback(async (searchKeyword = '') => {
    try {
      const { data } = await listReceivingMaterials(searchKeyword)
      setMaterials((current) => {
        const merged = new Map(current.map((material) => [material.id, material]))
        for (const material of data) merged.set(material.id, material)
        return Array.from(merged.values())
      })
    } catch (err) {
      // ignore
    }
  }, [])

  const updateSelectedMaterial = (material: Material | null) => {
    setConversionHistory(null)
    setConversionHistoryLoading(false)
    setForm((current) => ({
      ...current,
      materialId: material?.id || '',
      qty: 0,
      valuationQty: 0,
      unitPrice: 0,
      priceUnit: normalizeMaterialInPriceUnit(material?.stockUnit || material?.unit, material?.primaryMeasure),
      totalAmount: 0,
      priceInputMode: 'UNIT',
    }))
  }

  const resetForm = () => {
    setEditingItem(null)
    setDraftItems([])
    setConversionHistory(null)
    setForm(createEmptyMaterialInForm(locations.find((item) => item.isDefault)?.id || locations[0]?.id || ''))
  }

  const openCreateMaterialIn = () => {
    resetForm()
    setDraftAttachmentOwnerId(createDraftDocumentAttachmentId())
    setShowModal(true)
  }

  const closeMaterialInForm = () => {
    if (loading || draftAttachmentBusy) return
    if (!editingItem) void discardDraftDocumentAttachments('MATERIAL_IN', draftAttachmentOwnerId)
    setDraftAttachmentOwnerId('')
    setShowModal(false)
    resetForm()
  }

  const applyRecognizedMaterialIn = (fields: Record<string, unknown>) => {
    const supplierValue = recognizedText(fields, 'supplier')
    const materialValue = recognizedText(fields, 'material')
    const supplier = suppliers.find((item) => matchesRecognizedValue(supplierValue, [item.code, item.name]))
    const material = materials.find((item) => matchesRecognizedValue(materialValue, [item.code, item.name, item.spec]))
    const qty = recognizedNumber(fields, 'qty')
    const unitPrice = recognizedNumber(fields, 'unitPrice')
    const totalAmount = recognizedNumber(fields, 'totalAmount')
    setForm((current) => ({
      ...current,
      voucherNo: recognizedText(fields, 'voucherNo') || current.voucherNo,
      supplierId: supplier?.id || current.supplierId,
      materialId: material?.id || current.materialId,
      qty: qty || current.qty,
      unitPrice: unitPrice || current.unitPrice,
      totalAmount: totalAmount || current.totalAmount,
      priceInputMode: totalAmount ? 'TOTAL' : current.priceInputMode,
      priceUnit: material ? normalizeMaterialInPriceUnit(material.stockUnit || material.unit, material.primaryMeasure) : current.priceUnit,
      batchNo: recognizedText(fields, 'batchNo') || current.batchNo,
      receivedBy: recognizedText(fields, 'receivedBy') || current.receivedBy,
      note: recognizedText(fields, 'note') || current.note,
    }))
  }

  const validateCurrentItem = () => {
    if (!form.materialId || !form.locationId || calculatedStockQty <= 0) {
      return '请选择物料和库位，并输入有效的主单位数量'
    }
    if (materialUsesDualUnit && effectiveValuationQty <= 0) {
      return conversionHistoryLoading
        ? '正在读取历史实测数据，请稍候'
        : `该物料启用了辅助单位 ${valuationUnitLabel}，请填写本批实测辅助数量`
    }
    return null
  }

  const buildCurrentItem = (): MaterialInDraftItem => {
    const material = materials.find((item) => item.id === form.materialId)
    const stockUnit = material?.stockUnit || material?.unit || '个'
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      materialId: form.materialId,
      locationId: form.locationId,
      qty: calculatedStockQty,
      valuationQty: form.valuationQty > 0 ? form.valuationQty : undefined,
      unit: stockUnit,
      valuationUnit: material?.valuationUnit || stockUnit,
      unitPrice: unitPricePreview,
      totalAmount: totalAmountPreview,
      priceUnit: form.priceUnit,
      priceBasis: priceUsesValuation ? 'VALUATION' : 'STOCK',
      batchNo: form.batchNo || undefined,
    }
  }

  const resetCurrentItem = () => {
    setConversionHistory(null)
    setForm((current) => ({
      ...current,
      materialId: '',
      qty: 0,
      valuationQty: 0,
      unitPrice: 0,
      priceUnit: '件',
      totalAmount: 0,
      priceInputMode: 'UNIT',
      batchNo: '',
    }))
  }

  const addCurrentItem = () => {
    const error = validateCurrentItem()
    if (error) {
      onMessage(error)
      return
    }
    setDraftItems((current) => [...current, buildCurrentItem()])
    resetCurrentItem()
    onMessage('物料明细已加入，可继续添加')
  }

  const handleSubmit = async () => {
    if (draftAttachmentBusy) {
      onMessage('请等待附件上传或 AI 识别完成')
      return
    }
    if (!form.supplierId) {
      onMessage('请选择供应商')
      return
    }
    let items = [...draftItems]
    if (form.materialId) {
      const error = validateCurrentItem()
      if (error) {
        onMessage(error)
        return
      }
      items = [...items, buildCurrentItem()]
    }
    if (items.length === 0) {
      onMessage('请至少添加一种物料')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const data = await saveMaterialInRecord(editingItem?.id || null, {
          supplierId: form.supplierId,
          voucherNo: form.voucherNo || undefined,
          stagingLocationId: form.locationId,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
          items: items.map(({ id: _id, ...item }) => item),
      })
      onMessage(editingItem
        ? `来料单已修改：${data.data.inboundNo}`
        : `来料单创建成功，共 ${data.count || items.length} 种物料`)
      if (!editingItem) {
        try {
          await finalizeDraftDocumentAttachments({ ownerType: 'MATERIAL_IN', draftOwnerId: draftAttachmentOwnerId, targetOwnerId: data.data.id })
        } catch (error) {
          onMessage(`来料单已创建，但${error instanceof Error ? error.message : '附件绑定失败'}`)
        }
      }
      const pdfGenerated = await generateBusinessDocumentPdfArchives('material-in', [data.data.id])
      if (pdfGenerated) printPreview.open('material-in', data.data.id)
      else {
        printPreview.close()
        onMessage('来料单已保存，但部分 PDF 生成失败，可在来料列表中重新打印')
      }
      setShowModal(false)
      setDraftAttachmentOwnerId('')
      resetForm()
      await fetchMaterialIns()
    } catch (err) {
      printPreview.close()
      onMessage(err instanceof Error ? err.message : '创建来料单失败')
    }
    setLoading(false)
  }

  const calculatedStockQty = Number(form.qty || 0)
  const stockUnitLabel = selectedMaterial?.stockUnit || selectedMaterial?.unit || '库存单位'
  const valuationUnitLabel = selectedMaterial?.valuationUnit || stockUnitLabel
  const materialUsesDualUnit = Boolean(
    selectedMaterial?.referenceMeasure
      && selectedMaterial.referenceMeasure !== selectedMaterial.primaryMeasure
      && stockUnitLabel !== valuationUnitLabel,
  )
  const actualValuationQty = Number(form.valuationQty || 0)
  const historicalEstimatedValuationQty = materialUsesDualUnit
    && actualValuationQty <= 0
    && conversionHistory?.available
    && conversionHistory.rate
    && calculatedStockQty > 0
    ? Number((calculatedStockQty * conversionHistory.rate).toFixed(6))
    : 0
  const effectiveValuationQty = materialUsesDualUnit
    ? (actualValuationQty > 0 ? actualValuationQty : historicalEstimatedValuationQty)
    : calculatedStockQty
  const conversionRatePreview = calculatedStockQty > 0 && effectiveValuationQty > 0
    ? Number((effectiveValuationQty / calculatedStockQty).toFixed(6))
    : 0
  const conversionSource = !materialUsesDualUnit
    ? 'SAME_UNIT'
    : actualValuationQty > 0
      ? 'DOCUMENT_ACTUAL'
      : historicalEstimatedValuationQty > 0
        ? 'HISTORICAL_ESTIMATE'
        : 'MISSING'
  const stockPriceUnit = normalizeMaterialInPriceUnit(stockUnitLabel, selectedMaterial?.primaryMeasure)
  const valuationPriceUnit = normalizeMaterialInPriceUnit(
    valuationUnitLabel,
    selectedMaterial?.referenceMeasure || selectedMaterial?.primaryMeasure,
  )
  const priceUnitOptions = Array.from(new Set([stockPriceUnit, ...(materialUsesDualUnit ? [valuationPriceUnit] : [])]))
  const priceUsesValuation = materialUsesDualUnit
    && valuationPriceUnit !== stockPriceUnit
    && form.priceUnit === valuationPriceUnit
  const priceQuantity = priceUsesValuation ? effectiveValuationQty : calculatedStockQty
  const totalAmountPreview = form.priceInputMode === 'TOTAL'
    ? Number(Number(form.totalAmount || 0).toFixed(6))
    : Number((priceQuantity * Number(form.unitPrice || 0)).toFixed(6))
  const unitPricePreview = form.priceInputMode === 'TOTAL'
    ? (priceQuantity > 0 ? Number((totalAmountPreview / priceQuantity).toFixed(6)) : 0)
    : Number(form.unitPrice || 0)
  const valuationUnitCostPreview = effectiveValuationQty > 0 ? Number((totalAmountPreview / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCostPreview = calculatedStockQty > 0 ? Number((totalAmountPreview / calculatedStockQty).toFixed(6)) : 0

  const handleReceive = async (id: string) => {
    setLoading(true)
    try {
      const data = await receiveMaterialInRecord(id)
      onMessage(data.message || '收货成功')
      await fetchMaterialIns()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '收货失败')
    }
    setLoading(false)
  }

  const handleEdit = (item: MaterialIn) => {
    if (item.status !== 'PENDING') {
      onMessage('只有待收货来料单可以修改')
      return
    }

    setMaterials((current) => {
      const merged = new Map(current.map((material) => [material.id, material]))
      for (const line of item.items) merged.set(line.material.id, line.material)
      return Array.from(merged.values())
    })
    setEditingItem(item)
    setDraftAttachmentOwnerId('')
    setDraftItems(item.items.map((line) => ({
      id: line.id,
      materialId: line.materialId,
      locationId: item.stagingLocationId,
      qty: Number(line.qty),
      valuationQty: line.conversionSource === 'DOCUMENT_ACTUAL' ? Number(line.valuationQty) : undefined,
      unit: line.unit,
      valuationUnit: line.valuationUnit,
      unitPrice: Number(line.unitPrice),
      totalAmount: Number(line.totalAmount),
      priceUnit: normalizeMaterialInPriceUnit(line.priceUnit, line.material.primaryMeasure),
      priceBasis: line.priceBasis === 'VALUATION' ? 'VALUATION' : 'STOCK',
      batchNo: line.batchNo || undefined,
    })))
    setConversionHistory(null)
    setForm({
      voucherNo: item.voucherNo || '',
      supplierId: item.supplierId,
      materialId: '',
      locationId: item.stagingLocationId,
      qty: 0,
      valuationQty: 0,
      unitPrice: 0,
      priceUnit: '件',
      totalAmount: 0,
      priceInputMode: 'UNIT',
      batchNo: '',
      receivedBy: item.receivedBy || '',
      note: item.note || '',
    })
    setShowModal(true)
  }

  const handleReject = async (id: string) => {
    setLoading(true)
    try {
      const data = await rejectMaterialInRecord(id)
      onMessage(data.message || '拒收成功')
      await fetchMaterialIns()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '拒收失败')
    }
    setLoading(false)
  }

  const handleReverse = async (item: MaterialIn) => {
    const reason = window.prompt(`请输入红冲来料单 ${item.inboundNo} 的原因`)
    if (!reason) return

    setLoading(true)
    try {
      const data = await reverseMaterialInRecord(item.id, reason)
      onMessage(data.message || '红冲成功')
      await fetchMaterialIns()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : '红冲失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!onToolbarChange) return

    onToolbarChange(
      <ResponsiveToolbarActions
        primaryFilters={(
          <SearchFieldWithPresets
            storageKey="mes-lite.searchPresets.materialIns"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索来料单号、物料、供应商或批次"
          />
        )}
        advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
        viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
        actions={(
          <>
            <AppButton
              variant="create"
              onClick={openCreateMaterialIn}
            >
              新建来料单
            </AppButton>
          </>
        )}
      />
    )

    return () => onToolbarChange(null)
  }, [advancedSearchFields, onToolbarChange, keyword, selectedStatuses, selectedCustomerId, selectedSupplierId, customers, suppliers, viewMode, setViewMode])

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <SearchFieldWithPresets
              storageKey="mes-lite.searchPresets.materialIns"
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索来料单号、物料、供应商或批次"
            />
          )}
          advancedSearch={<MappedResourceAdvancedSearch fields={advancedSearchFields} />}
          viewControl={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
          actions={(
            <>
              <AppButton
                variant="create"
                onClick={openCreateMaterialIn}
              >
                新建来料单
              </AppButton>
            </>
          )}
        />
      </TopBarPortal>
      <div className="space-y-4">
      <div className="rounded-lg bg-white p-3 shadow sm:p-6">
        <MaterialInCollectionView
          items={materialInSort.sortedRows}
          viewMode={viewMode}
          loading={loading}
          sortColumn={materialInSort.sortColumn}
          sortDirection={materialInSort.sortDirection}
          onSort={materialInSort.toggleSort}
          onMessage={onMessage}
          onDetail={setDetailItem}
          onEdit={handleEdit}
          onReceive={handleReceive}
          onReject={handleReject}
          onReverse={handleReverse}
        />
      </div>

      {detailItem && (
        <MaterialInDetailDialog item={detailItem} onClose={() => setDetailItem(null)} onMessage={onMessage} />
      )}

      <MaterialInEditorDialog
        open={showModal}
        editingItem={editingItem}
        form={form}
        setForm={setForm}
        loading={loading}
        draftAttachmentBusy={draftAttachmentBusy}
        draftAttachmentOwnerId={draftAttachmentOwnerId}
        draftItems={draftItems}
        setDraftItems={setDraftItems}
        setDraftAttachmentBusy={setDraftAttachmentBusy}
        suppliers={suppliers}
        materials={materials}
        locations={locations}
        selectedMaterial={selectedMaterial}
        conversionHistory={conversionHistory}
        conversionHistoryLoading={conversionHistoryLoading}
        calculatedStockQty={calculatedStockQty}
        stockUnitLabel={stockUnitLabel}
        materialUsesDualUnit={materialUsesDualUnit}
        effectiveValuationQty={effectiveValuationQty}
        valuationUnitLabel={valuationUnitLabel}
        conversionSource={conversionSource}
        conversionRatePreview={conversionRatePreview}
        priceUnitOptions={priceUnitOptions}
        priceUsesValuation={priceUsesValuation}
        priceQuantity={priceQuantity}
        unitPricePreview={unitPricePreview}
        totalAmountPreview={totalAmountPreview}
        stockUnitCostPreview={stockUnitCostPreview}
        valuationUnitCostPreview={valuationUnitCostPreview}
        onClose={closeMaterialInForm}
        onSubmit={handleSubmit}
        onSupplierSearch={fetchSuppliers}
        onMaterialSearch={fetchMaterials}
        onMaterialChange={updateSelectedMaterial}
        onAddCurrentItem={addCurrentItem}
        onRecognized={applyRecognizedMaterialIn}
        onMessage={onMessage}
      />
      </div>
    </>
  )
}
