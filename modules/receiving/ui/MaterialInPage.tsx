'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { getStatusQuery } from '@/app/components/StatusCheckboxFilter'
import ResponsiveToolbarActions from '@/app/components/ResponsiveToolbarActions'
import TopBarPortal from '@/app/components/TopBarPortal'
import ViewModeToggle, { usePersistedViewMode } from '@/app/components/ViewModeToggle'
import { SearchFieldWithPresets } from '@/app/components/SavedSearchPresets'
import { type MaterialInPriceUnit, normalizeMaterialInPriceUnit } from '@/lib/material-in-quantity'
import useClientTableSort from '@/app/components/useClientTableSort'
import AppButton from '@/app/components/AppButton'
import { MappedResourceAdvancedSearch } from '@/app/components/resource'
import BusinessDocumentPrintLink, { generateBusinessDocumentPdfArchives, reserveBusinessDocumentPrintWindow } from '@/app/components/BusinessDocumentPrintLink'
import {
  createDraftDocumentAttachmentId,
  discardDraftDocumentAttachments,
  finalizeDraftDocumentAttachments,
} from '@/app/components/DraftDocumentAttachmentPanel'
import { matchesRecognizedValue, recognizedNumber, recognizedText } from '@/lib/document-recognition-fields'

import type {
  CustomerOption as Customer,
  InventoryLocationOption as InventoryLocation,
  MaterialInDraftItem,
  MaterialInRecord as MaterialIn,
  ReceivingMaterialOption as Material,
  SupplierOption as Supplier,
} from '../contracts/material-in'
import {
  createEmptyMaterialInForm,
  displayMaterialInPriceUnit as displayPriceUnit,
  formatReceivingMaterialLabel as formatMaterialLabel,
  materialInStatusColors as statusColors,
  materialInStatusLabels as statusLabels,
  materialInStatusOptions as statusOptions,
} from '../model/material-in-view'
import MaterialInCollectionView from './MaterialInCollectionView'
import MaterialInDetailDialog from './MaterialInDetailDialog'
import MaterialInEditorDialog from './MaterialInEditorDialog'
import {
  listMaterialInRecords,
  listReceivingCustomers,
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
  const [linkedBatchRatios, setLinkedBatchRatios] = useState<{ lengthPerPiece: number; weightPerLength: number } | null>(null)
  const [viewMode, setViewMode] = usePersistedViewMode('mes-lite.materialIn.viewMode', 'list')
  const advancedSearchFields = useMemo(() => [
    { key: 'status', label: '状态', value: selectedStatuses.length === 1 ? selectedStatuses[0] : '', onChange: (value: string) => setSelectedStatuses(value ? [value] : statusOptions.map((option) => option.value)), options: statusOptions },
    { key: 'customerId', label: '归属客户', value: selectedCustomerId, onChange: setSelectedCustomerId, options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'supplierId', label: '供应商', value: selectedSupplierId, onChange: setSelectedSupplierId, options: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })) },
  ], [customers, selectedCustomerId, selectedStatuses, selectedSupplierId, suppliers])

  const [form, setForm] = useState(createEmptyMaterialInForm)
  const materialInSort = useClientTableSort(materialIns, {
    inboundNo: (item) => item.inboundNo,
    voucherNo: (item) => item.voucherNo,
    supplier: (item) => item.supplier?.name,
    material: (item) => `${item.material?.code || ''} ${item.material?.name || ''}`,
    location: (item) => item.location ? `${item.location.code} ${item.location.name}` : null,
    qty: (item) => item.qty,
    valuationQty: (item) => item.valuationQty,
    unitPrice: (item) => item.unitPrice,
    valuationUnitCost: (item) => item.valuationUnitCost,
    stockUnitCost: (item) => item.stockUnitCost,
    totalAmount: (item) => item.totalAmount,
    batchNo: (item) => item.batchNo,
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
    setLinkedBatchRatios(null)
    setForm((current) => ({
      ...current,
      materialId: material?.id || '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      totalLength: 0,
      totalWeight: 0,
      unitPrice: 0,
      priceUnit: normalizeMaterialInPriceUnit(material?.stockUnit || material?.unit, material?.primaryMeasure),
      totalAmount: 0,
      priceInputMode: 'UNIT',
    }))
  }

  const resetForm = () => {
    setEditingItem(null)
    setDraftItems([])
    setLinkedBatchRatios(null)
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
      pieceCount: material?.stockUnit === '件' && qty ? qty : current.pieceCount,
      stockQtyInput: qty || current.stockQtyInput,
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
    if (isLengthMaterial && form.pieceCount <= 0) return '长度型物料请填写数量'
    if (form.priceUnit === 'm' && totalAmountPreview > 0 && calculatedTotalLength <= 0) return '按米计价时请填写总长度'
    if (form.priceUnit === 'kg' && totalAmountPreview > 0 && form.totalWeight <= 0) return '按 kg 计价时请填写总重量'
    if (form.priceUnit === '件' && totalAmountPreview > 0 && form.pieceCount <= 0) return '按件计价时请填写数量'
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
      pieceCount: form.pieceCount > 0 ? form.pieceCount : undefined,
      stockQtyMode: isLengthMaterial ? form.stockQtyMode : undefined,
      stockQtyInput: isLengthMaterial ? form.stockQtyInput : undefined,
      totalLength: calculatedTotalLength > 0 ? calculatedTotalLength : undefined,
      totalWeight: form.totalWeight > 0 ? form.totalWeight : undefined,
      unit: stockUnit,
      valuationUnit: material?.valuationUnit || stockUnit,
      unitPrice: unitPricePreview,
      totalAmount: totalAmountPreview,
      priceUnit: form.priceUnit,
      priceBasis: form.priceUnit === 'kg' ? 'VALUATION' : 'STOCK',
      batchNo: form.batchNo || undefined,
    }
  }

  const resetCurrentItem = () => {
    setLinkedBatchRatios(null)
    setForm((current) => ({
      ...current,
      materialId: '',
      locationId: locations.find((item) => item.isDefault)?.id || locations[0]?.id || '',
      qty: 0,
      pieceCount: 0,
      stockQtyMode: 'TOTAL',
      stockQtyInput: 0,
      totalLength: 0,
      totalWeight: 0,
      unitPrice: 0,
      priceUnit: 'm',
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
    if (editingItem && items.length !== 1) {
      onMessage('请填写有效的来料明细')
      return
    }
    if (!editingItem && items.length === 0) {
      onMessage('请至少添加一种物料')
      return
    }
    const printPreview = reserveBusinessDocumentPrintWindow()
    setLoading(true)
    try {
      const data = await saveMaterialInRecord(editingItem?.id || null, editingItem ? {
          supplierId: form.supplierId,
          voucherNo: form.voucherNo || undefined,
          ...items[0],
          id: undefined,
          receivedBy: form.receivedBy || undefined,
          note: form.note || undefined,
        } : {
          supplierId: form.supplierId,
          voucherNo: form.voucherNo || undefined,
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
      const pdfGenerated = await generateBusinessDocumentPdfArchives('material-in', (data.items || [data.data]).map((item) => item.id))
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

  const selectedMaterial = materials.find((material) => material.id === form.materialId)
  const isLengthMaterial = selectedMaterial?.primaryMeasure === 'LENGTH'
  const calculatedTotalLength = isLengthMaterial
    ? Number(((form.stockQtyMode === 'PER_PIECE'
      ? Number(form.pieceCount || 0) * Number(form.stockQtyInput || 0)
      : Number(form.stockQtyInput || 0))).toFixed(6))
    : Number(form.totalLength || 0)
  const calculatedStockQty = selectedMaterial?.primaryMeasure === 'LENGTH'
    ? calculatedTotalLength
    : selectedMaterial?.primaryMeasure === 'WEIGHT'
      ? Number(form.totalWeight || 0)
      : selectedMaterial?.primaryMeasure === 'QUANTITY'
        ? Number(form.pieceCount || 0)
        : Number(form.qty || 0)
  const referenceValuationQty = selectedMaterial && calculatedStockQty > 0 ? Number((calculatedStockQty * (selectedMaterial.conversionRate || 1)).toFixed(6)) : 0
  const stockUnitLabel = selectedMaterial?.stockUnit || selectedMaterial?.unit || '库存单位'
  const valuationUnitLabel = selectedMaterial?.valuationUnit || 'kg'
  const materialUsesDualUnit = Boolean(selectedMaterial && (stockUnitLabel !== valuationUnitLabel || Number(selectedMaterial.conversionRate || 1) !== 1))
  const actualReferenceQty = selectedMaterial?.referenceMeasure === 'LENGTH'
    ? calculatedTotalLength
    : selectedMaterial?.referenceMeasure === 'WEIGHT'
      ? Number(form.totalWeight || 0)
      : selectedMaterial?.referenceMeasure === 'QUANTITY'
        ? Number(form.pieceCount || 0)
        : 0
  const effectiveValuationQty = materialUsesDualUnit
    ? (actualReferenceQty > 0 ? actualReferenceQty : referenceValuationQty)
    : calculatedStockQty
  const actualConversionRate = calculatedStockQty > 0 && effectiveValuationQty > 0 ? Number((effectiveValuationQty / calculatedStockQty).toFixed(6)) : 0
  const priceQuantity = form.priceUnit === 'm'
    ? calculatedTotalLength
    : form.priceUnit === 'kg'
      ? Number(form.totalWeight || 0)
      : Number(form.pieceCount || 0)
  const totalAmountPreview = form.priceInputMode === 'TOTAL'
    ? Number(Number(form.totalAmount || 0).toFixed(6))
    : Number((priceQuantity * Number(form.unitPrice || 0)).toFixed(6))
  const unitPricePreview = form.priceInputMode === 'TOTAL'
    ? (priceQuantity > 0 ? Number((totalAmountPreview / priceQuantity).toFixed(6)) : 0)
    : Number(form.unitPrice || 0)
  const valuationUnitCostPreview = effectiveValuationQty > 0 ? Number((totalAmountPreview / effectiveValuationQty).toFixed(6)) : 0
  const stockUnitCostPreview = calculatedStockQty > 0 ? Number((totalAmountPreview / calculatedStockQty).toFixed(6)) : 0
  const canLinkLengthWeight = isLengthMaterial
    && form.pieceCount > 0
    && calculatedStockQty > 0
    && form.totalWeight > 0

  const toggleBatchLink = () => {
    if (linkedBatchRatios) {
      setLinkedBatchRatios(null)
      return
    }
    if (!canLinkLengthWeight) {
      onMessage('请先填写数量、总长度和总重量，再开启比例联动')
      return
    }
    setLinkedBatchRatios({
      lengthPerPiece: calculatedStockQty / form.pieceCount,
      weightPerLength: form.totalWeight / calculatedStockQty,
    })
    setForm((current) => ({ ...current, stockQtyMode: 'TOTAL', stockQtyInput: calculatedStockQty }))
  }

  const updateLinkedPieceCount = (pieceCount: number) => {
    if (!linkedBatchRatios) {
      setForm({ ...form, pieceCount })
      return
    }
    const totalLength = Number((pieceCount * linkedBatchRatios.lengthPerPiece).toFixed(6))
    setForm({
      ...form,
      pieceCount,
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      totalLength,
      totalWeight: Number((totalLength * linkedBatchRatios.weightPerLength).toFixed(6)),
    })
  }

  const updateLinkedTotalLength = (totalLength: number) => {
    if (!linkedBatchRatios) {
      setForm({ ...form, stockQtyInput: totalLength, totalLength })
      return
    }
    setForm({
      ...form,
      pieceCount: Math.max(1, Math.round(totalLength / linkedBatchRatios.lengthPerPiece)),
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      totalLength,
      totalWeight: Number((totalLength * linkedBatchRatios.weightPerLength).toFixed(6)),
    })
  }

  const updateLinkedTotalWeight = (totalWeight: number) => {
    if (!linkedBatchRatios || linkedBatchRatios.weightPerLength <= 0) {
      setForm({ ...form, totalWeight })
      return
    }
    const totalLength = Number((totalWeight / linkedBatchRatios.weightPerLength).toFixed(6))
    setForm({
      ...form,
      pieceCount: Math.max(1, Math.round(totalLength / linkedBatchRatios.lengthPerPiece)),
      stockQtyMode: 'TOTAL',
      stockQtyInput: totalLength,
      totalLength,
      totalWeight,
    })
  }

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

    setMaterials((current) => current.some((material) => material.id === item.material.id)
      ? current
      : [...current, item.material])
    setEditingItem(item)
    setDraftAttachmentOwnerId('')
    setDraftItems([])
    setLinkedBatchRatios(null)
    setForm({
      voucherNo: item.voucherNo || '',
      supplierId: item.supplierId,
      materialId: item.materialId,
      locationId: item.locationId || locations.find((location) => location.isDefault)?.id || '',
      qty: item.material.primaryMeasure === 'LENGTH' ? 0 : Number(item.qty),
      pieceCount: Number(item.pieceCount || 0),
      stockQtyMode: item.stockQtyMode || 'TOTAL',
      stockQtyInput: Number(item.stockQtyInput ?? item.qty),
      totalLength: Number(item.totalLength ?? (item.material.primaryMeasure === 'LENGTH' ? item.qty : 0)),
      totalWeight: Number(item.totalWeight ?? (item.material.referenceMeasure === 'WEIGHT' ? item.valuationQty : item.material.primaryMeasure === 'WEIGHT' ? item.qty : 0)),
      unitPrice: Number(item.unitPrice),
      priceUnit: normalizeMaterialInPriceUnit(item.priceUnit, item.material.primaryMeasure),
      totalAmount: Number(item.totalAmount),
      priceInputMode: 'TOTAL',
      batchNo: item.batchNo || '',
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
        linkedBatchRatios={linkedBatchRatios}
        setLinkedBatchRatios={setLinkedBatchRatios}
        isLengthMaterial={isLengthMaterial}
        calculatedStockQty={calculatedStockQty}
        calculatedTotalLength={calculatedTotalLength}
        stockUnitLabel={stockUnitLabel}
        materialUsesDualUnit={materialUsesDualUnit}
        effectiveValuationQty={effectiveValuationQty}
        valuationUnitLabel={valuationUnitLabel}
        actualReferenceQty={actualReferenceQty}
        referenceValuationQty={referenceValuationQty}
        priceQuantity={priceQuantity}
        unitPricePreview={unitPricePreview}
        totalAmountPreview={totalAmountPreview}
        stockUnitCostPreview={stockUnitCostPreview}
        valuationUnitCostPreview={valuationUnitCostPreview}
        actualConversionRate={actualConversionRate}
        onClose={closeMaterialInForm}
        onSubmit={handleSubmit}
        onSupplierSearch={fetchSuppliers}
        onMaterialSearch={fetchMaterials}
        onMaterialChange={updateSelectedMaterial}
        onUpdatePieceCount={updateLinkedPieceCount}
        onUpdateTotalLength={updateLinkedTotalLength}
        onUpdateTotalWeight={updateLinkedTotalWeight}
        onToggleBatchLink={toggleBatchLink}
        onAddCurrentItem={addCurrentItem}
        onRecognized={applyRecognizedMaterialIn}
        onMessage={onMessage}
      />
      </div>
    </>
  )
}
