'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bomStoredQuantityToEntry,
  convertBomEntryQuantity,
  defaultBomEntryUnit,
} from '@/lib/bom-entry-units'
import { BomApiError, saveBom } from '../client'
import type {
  BomItem,
  BomMaterialOption,
  BomUnitCatalogItem,
  DraftBomItem,
  DraftBomOutput,
  MaterialBom,
} from '../contracts'
import { bomProductIdForMaterial, indexBomProductsByMaterialId } from '../model/bom-material'
import { isBomDraftDirty } from '../model/bom-draft'

interface UseBomDraftControllerOptions {
  products: MaterialBom[]
  materialOptions: BomMaterialOption[]
  unitCatalog: BomUnitCatalogItem[]
  preferredLengthUnit?: string
  preferredWeightUnit?: string
  onMessage: (message: string) => void
  onAfterSave?: (preferredBomId?: string) => Promise<void> | void
}

export default function useBomDraftController({
  products,
  materialOptions,
  unitCatalog,
  preferredLengthUnit,
  preferredWeightUnit,
  onMessage,
  onAfterSave,
}: UseBomDraftControllerOptions) {
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedBomId, setSelectedBomId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftPurpose, setDraftPurpose] = useState<'PRODUCTION' | 'PACKAGING'>('PRODUCTION')
  const [primaryOutputQuantity, setPrimaryOutputQuantity] = useState('1')
  const [primaryOutputUnit, setPrimaryOutputUnit] = useState('件')
  const [draftOutputs, setDraftOutputs] = useState<DraftBomOutput[]>([])
  const [draftIsDefault, setDraftIsDefault] = useState(true)
  const [draftItems, setDraftItems] = useState<DraftBomItem[]>([])
  const [saving, setSaving] = useState(false)
  const loadedDraftSignatureRef = useRef('')

  const productByMaterialId = useMemo(() => indexBomProductsByMaterialId(products), [products])
  const materialById = useMemo(() => new Map(materialOptions.map((material) => [material.id, material])), [materialOptions])
  const selectedMaterial = materialById.get(selectedMaterialId) || null
  const selectedProduct = selectedMaterial ? productByMaterialId.get(selectedMaterial.id) || null : null
  const selectedBom = selectedBomId === '__new__'
    ? null
    : selectedProduct?.boms.find((bom) => bom.id === selectedBomId) || selectedProduct?.bom || null
  const numericPrimaryOutputQuantity = Number(primaryOutputQuantity)

  const preferredEntryUnit = useCallback((material: BomMaterialOption) => {
    const preferredCode = material.primaryMeasure === 'LENGTH'
      ? preferredLengthUnit
      : material.primaryMeasure === 'WEIGHT'
        ? preferredWeightUnit
        : undefined
    return defaultBomEntryUnit(unitCatalog, material, preferredCode)
  }, [preferredLengthUnit, preferredWeightUnit, unitCatalog])

  const savedMaterialItems = useMemo(() => (
    selectedBom?.items.filter((item) => item.itemType === 'MATERIAL' && item.material) || []
  ), [selectedBom])
  const savedBatchItems = useMemo(() => {
    const byMaterial = new Map<string, BomItem>()
    savedMaterialItems.forEach((item) => {
      const materialId = item.material?.id
      if (!materialId) return
      const existing = byMaterial.get(materialId)
      byMaterial.set(materialId, existing
        ? { ...existing, quantity: Number(existing.quantity) + Number(item.quantity) }
        : item)
    })
    return Array.from(byMaterial.values())
  }, [savedMaterialItems])
  const savedAdditionalOutputs = useMemo(() => (
    selectedBom?.outputs.filter((output) => !output.isPrimary) || []
  ), [selectedBom])
  const dirty = isBomDraftDirty({
    selectedBomId,
    selectedBom,
    selectedMaterial,
    savedBatchItems,
    savedAdditionalOutputs,
    draftItems,
    draftOutputs,
    draftName,
    draftPurpose,
    draftIsDefault,
    primaryOutputQuantity: numericPrimaryOutputQuantity,
    primaryOutputUnit,
    materialById,
    unitCatalog,
  })

  useEffect(() => {
    if (!selectedMaterialId) return
    if (!materialById.has(selectedMaterialId)) {
      setSelectedMaterialId('')
      setSelectedBomId('__new__')
    }
  }, [materialById, selectedMaterialId])

  useEffect(() => {
    if (!selectedProduct) {
      if (selectedBomId !== '__new__') setSelectedBomId('__new__')
      return
    }
    if (selectedBomId === '__new__') return
    if (!selectedProduct.boms.some((bom) => bom.id === selectedBomId)) {
      setSelectedBomId(selectedProduct.bom?.id || '__new__')
    }
  }, [selectedBomId, selectedProduct])

  useEffect(() => {
    if (selectedMaterial && ['LENGTH', 'WEIGHT'].includes(selectedMaterial.primaryMeasure || '') && unitCatalog.length === 0) return
    const savedSignature = selectedBomId === '__new__'
      ? `new:${selectedProduct?.id || ''}`
      : JSON.stringify({
          bomId: selectedBom?.id || '',
          name: selectedBom?.name || '',
          purpose: selectedBom?.purpose || 'PRODUCTION',
          isDefault: selectedBom?.isDefault ?? true,
          outputQuantity: Number(selectedBom?.outputQuantity || 1),
          outputs: (selectedBom?.outputs || []).map((output) => ({
            id: output.id,
            materialId: output.material.id,
            quantity: Number(output.quantity),
            entryUnit: output.entryUnit || output.unit,
            isPrimary: output.isPrimary,
          })),
          items: savedBatchItems.map((item) => ({
            id: item.id,
            materialId: item.material?.id || '',
            quantity: Number(item.quantity || 0),
            unit: item.material?.stockUnit || item.material?.unit || item.unit || '件',
            entryUnit: item.entryUnit || item.unit,
          })),
        })
    if (loadedDraftSignatureRef.current === savedSignature) return
    loadedDraftSignatureRef.current = savedSignature

    if (selectedBomId === '__new__') {
      setDraftName(`BOM ${(selectedProduct?.boms.length || 0) + 1}`)
      setDraftPurpose('PRODUCTION')
      setPrimaryOutputQuantity('1')
      setPrimaryOutputUnit(selectedMaterial ? preferredEntryUnit(selectedMaterial) : '件')
      setDraftOutputs([])
      setDraftIsDefault((selectedProduct?.boms.length || 0) === 0)
      setDraftItems([])
      return
    }

    setDraftName(selectedBom?.name || '默认方案')
    setDraftPurpose(selectedBom?.purpose || 'PRODUCTION')
    const primaryOutput = selectedBom?.outputs.find((output) => output.isPrimary)
    const primaryEntryUnit = primaryOutput?.entryUnit
      || primaryOutput?.unit
      || selectedMaterial?.stockUnit
      || selectedMaterial?.unit
      || '件'
    setPrimaryOutputUnit(primaryEntryUnit)
    setPrimaryOutputQuantity(String(bomStoredQuantityToEntry({
      quantity: Number(primaryOutput?.quantity || selectedBom?.outputQuantity || 1),
      entryUnit: primaryEntryUnit,
      material: selectedMaterial || {},
      catalog: unitCatalog,
    })))
    setDraftOutputs(savedAdditionalOutputs.map((output) => ({
      clientId: output.id,
      materialId: output.material.id,
      quantity: bomStoredQuantityToEntry({
        quantity: Number(output.quantity),
        entryUnit: output.entryUnit || output.unit,
        material: output.material,
        catalog: unitCatalog,
      }),
      unit: output.entryUnit || output.unit || output.material.stockUnit || output.material.unit,
    })))
    setDraftIsDefault(selectedBom?.isDefault ?? true)
    setDraftItems(savedBatchItems.map((item) => ({
      clientId: item.id,
      materialId: item.material?.id || '',
      quantity: bomStoredQuantityToEntry({
        quantity: Number(item.quantity || 0),
        entryUnit: item.entryUnit || item.unit,
        material: item.material || {},
        catalog: unitCatalog,
      }),
      unit: item.entryUnit || item.unit || item.material?.stockUnit || item.material?.unit || '件',
      wastageRate: 0,
    })))
  }, [preferredEntryUnit, savedAdditionalOutputs, savedBatchItems, selectedBom, selectedBomId, selectedMaterial, selectedProduct, unitCatalog])

  const selectMaterialForBom = useCallback((materialId: string) => {
    const product = materialId ? productByMaterialId.get(materialId) : null
    const material = materialById.get(materialId)
    loadedDraftSignatureRef.current = `new:${product?.id || ''}`
    setSelectedMaterialId(materialId)
    setSelectedBomId('__new__')
    setDraftName(`BOM ${(product?.boms.length || 0) + 1}`)
    setDraftPurpose('PRODUCTION')
    setPrimaryOutputQuantity('1')
    setPrimaryOutputUnit(material ? preferredEntryUnit(material) : '件')
    setDraftOutputs([])
    setDraftIsDefault((product?.boms.length || 0) === 0)
    setDraftItems([])
  }, [materialById, preferredEntryUnit, productByMaterialId])

  const selectOutputMaterial = useCallback((materialId: string) => {
    const product = productByMaterialId.get(materialId)
    const material = materialById.get(materialId)
    loadedDraftSignatureRef.current = `new:${product?.id || ''}`
    setSelectedMaterialId(materialId)
    setSelectedBomId('__new__')
    setPrimaryOutputQuantity('1')
    setPrimaryOutputUnit(material ? preferredEntryUnit(material) : '件')
    setDraftOutputs([])
    setDraftName((current) => current.trim() || `BOM ${(product?.boms.length || 0) + 1}`)
    setDraftIsDefault((product?.boms.length || 0) === 0)
  }, [materialById, preferredEntryUnit, productByMaterialId])

  const selectExistingBom = useCallback((materialId: string, bomId: string) => {
    loadedDraftSignatureRef.current = ''
    setSelectedMaterialId(materialId)
    setSelectedBomId(bomId)
  }, [])

  const addInput = useCallback((materialId: string) => {
    if (!materialId) return
    if (materialId === selectedMaterialId || draftOutputs.some((output) => output.materialId === materialId)) {
      onMessage('同一物料不能同时作为 BOM 投入和产出')
      return
    }
    if (draftItems.some((item) => item.materialId === materialId)) {
      onMessage('该投入物料已经添加')
      return
    }
    const material = materialById.get(materialId)
    if (!material) return
    setDraftItems((current) => [...current, {
      clientId: `input-${materialId}-${Date.now()}`,
      materialId,
      quantity: '1',
      unit: preferredEntryUnit(material),
      wastageRate: 0,
    }])
  }, [draftItems, draftOutputs, materialById, onMessage, preferredEntryUnit, selectedMaterialId])

  const addOutput = useCallback((materialId: string) => {
    if (!materialId) return
    if (!selectedMaterial) {
      selectOutputMaterial(materialId)
      return
    }
    if (materialId === selectedMaterial.id) {
      onMessage('该物料已是主产出')
      return
    }
    if (draftItems.some((item) => item.materialId === materialId)) {
      onMessage('同一物料不能同时作为 BOM 投入和产出')
      return
    }
    const material = materialById.get(materialId)
    if (!material) return
    setDraftOutputs((current) => current.some((output) => output.materialId === materialId)
      ? current
      : [...current, {
          clientId: `output-${materialId}-${Date.now()}`,
          materialId,
          quantity: '1',
          unit: preferredEntryUnit(material),
        }])
  }, [draftItems, materialById, onMessage, preferredEntryUnit, selectOutputMaterial, selectedMaterial])

  const removePrimaryOutput = useCallback(() => {
    const [replacement, ...remainingOutputs] = draftOutputs
    if (!replacement) {
      loadedDraftSignatureRef.current = 'new:'
      setSelectedMaterialId('')
      setSelectedBomId('__new__')
      setPrimaryOutputQuantity('1')
      setPrimaryOutputUnit('件')
      return
    }

    const replacementMaterial = materialById.get(replacement.materialId)
    if (!replacementMaterial) return
    const replacementProduct = productByMaterialId.get(replacement.materialId)
    loadedDraftSignatureRef.current = `new:${replacementProduct?.id || ''}`
    setSelectedMaterialId(replacement.materialId)
    setSelectedBomId('__new__')
    setPrimaryOutputQuantity(String(replacement.quantity))
    setPrimaryOutputUnit(replacement.unit)
    setDraftOutputs(remainingOutputs)
    if (selectedBom) onMessage('主产出已更换；保存时将创建新方案，原 BOM 保持不变')
  }, [draftOutputs, materialById, onMessage, productByMaterialId, selectedBom])

  const convertDraftQuantity = useCallback((
    quantity: number | string,
    fromUnit: string,
    toUnit: string,
    material: BomMaterialOption,
  ) => {
    if (String(quantity).trim() === '') return String(quantity)
    return String(convertBomEntryQuantity(Number(quantity), fromUnit, toUnit, material, unitCatalog))
  }, [unitCatalog])

  const changeInputUnit = useCallback((clientId: string, nextUnit: string) => {
    setDraftItems((current) => current.map((item) => {
      if (item.clientId !== clientId) return item
      const material = materialById.get(item.materialId)
      if (!material) return item
      try {
        return { ...item, quantity: convertDraftQuantity(item.quantity, item.unit, nextUnit, material), unit: nextUnit }
      } catch (error) {
        onMessage(error instanceof Error ? error.message : '单位换算失败')
        return item
      }
    }))
  }, [convertDraftQuantity, materialById, onMessage])

  const changeOutputUnit = useCallback((clientId: string, nextUnit: string) => {
    setDraftOutputs((current) => current.map((output) => {
      if (output.clientId !== clientId) return output
      const material = materialById.get(output.materialId)
      if (!material) return output
      try {
        return { ...output, quantity: convertDraftQuantity(output.quantity, output.unit, nextUnit, material), unit: nextUnit }
      } catch (error) {
        onMessage(error instanceof Error ? error.message : '单位换算失败')
        return output
      }
    }))
  }, [convertDraftQuantity, materialById, onMessage])

  const changePrimaryOutputUnit = useCallback((nextUnit: string) => {
    if (!selectedMaterial) return
    try {
      setPrimaryOutputQuantity((current) => convertDraftQuantity(current, primaryOutputUnit, nextUnit, selectedMaterial))
      setPrimaryOutputUnit(nextUnit)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '单位换算失败')
    }
  }, [convertDraftQuantity, onMessage, primaryOutputUnit, selectedMaterial])

  const updateInputQuantity = useCallback((clientId: string, quantity: string) => {
    setDraftItems((current) => current.map((item) => item.clientId === clientId ? { ...item, quantity } : item))
  }, [])
  const updateOutputQuantity = useCallback((clientId: string, quantity: string) => {
    setDraftOutputs((current) => current.map((output) => output.clientId === clientId ? { ...output, quantity } : output))
  }, [])
  const removeInput = useCallback((clientId: string) => {
    setDraftItems((current) => current.filter((item) => item.clientId !== clientId))
  }, [])
  const removeOutput = useCallback((clientId: string) => {
    setDraftOutputs((current) => current.filter((output) => output.clientId !== clientId))
  }, [])

  const save = useCallback(async () => {
    if (!selectedMaterial) {
      onMessage('请先添加主产出物料')
      return false
    }
    if (draftItems.length === 0) {
      onMessage('请至少添加一项投入物料')
      return false
    }
    if (!draftName.trim()) {
      onMessage('请填写 BOM 名称')
      return false
    }
    if (!Number.isFinite(numericPrimaryOutputQuantity) || numericPrimaryOutputQuantity <= 0) {
      onMessage('基准产出数量必须大于 0')
      return false
    }
    if (draftItems.some((item) => !item.materialId || Number(item.quantity) <= 0)) {
      onMessage('请为每种投入物料填写大于 0 的每批数量')
      return false
    }
    if (draftOutputs.some((output) => !output.materialId || Number(output.quantity) <= 0)) {
      onMessage('请为每项产出填写大于 0 的基准数量')
      return false
    }

    setSaving(true)
    try {
      const result = await saveBom({
        productId: selectedProduct?.id || bomProductIdForMaterial(selectedMaterial.id),
        bomId: selectedBom?.id,
        createNew: selectedBomId === '__new__',
        name: draftName.trim(),
        purpose: draftPurpose,
        isDefault: draftIsDefault,
        isActive: selectedBom?.isActive ?? true,
        outputQuantity: numericPrimaryOutputQuantity,
        outputs: [
          {
            materialId: selectedMaterial.id,
            quantity: numericPrimaryOutputQuantity,
            entryUnit: primaryOutputUnit,
            isPrimary: true,
          },
          ...draftOutputs.map((output) => ({
            materialId: output.materialId,
            quantity: Number(output.quantity),
            entryUnit: output.unit,
            isPrimary: false,
          })),
        ],
        items: draftItems.map((item) => ({
          materialId: item.materialId,
          quantity: Number(item.quantity),
          entryUnit: item.unit,
          wastageRate: 0,
        })),
      })
      onMessage(result.message || 'BOM 已保存')
      await onAfterSave?.(result.id)
      return true
    } catch (error) {
      onMessage(error instanceof BomApiError ? error.message : '保存 BOM 批次配方失败')
      return false
    } finally {
      setSaving(false)
    }
  }, [draftIsDefault, draftItems, draftName, draftOutputs, draftPurpose, numericPrimaryOutputQuantity, onAfterSave, onMessage, primaryOutputUnit, selectedBom, selectedBomId, selectedMaterial, selectedProduct])

  return {
    materialOptions,
    unitCatalog,
    productByMaterialId,
    materialById,
    selectedMaterialId,
    selectedBomId,
    selectedMaterial,
    selectedProduct,
    selectedBom,
    draftName,
    draftPurpose,
    primaryOutputQuantity,
    primaryOutputUnit,
    draftOutputs,
    draftIsDefault,
    draftItems,
    dirty,
    saving,
    setDraftName,
    setDraftPurpose,
    setDraftIsDefault,
    setPrimaryOutputQuantity,
    selectMaterialForBom,
    selectExistingBom,
    addInput,
    addOutput,
    removePrimaryOutput,
    updateInputQuantity,
    updateOutputQuantity,
    removeInput,
    removeOutput,
    changeInputUnit,
    changeOutputUnit,
    changePrimaryOutputUnit,
    save,
  }
}

export type BomDraftController = ReturnType<typeof useBomDraftController>
