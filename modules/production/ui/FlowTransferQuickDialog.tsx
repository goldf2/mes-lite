'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import ModalDialog from '@/app/components/ModalDialog'
import { confirmFlowTransfer, loadFlowTransfers, saveFlowTransfer } from '../client/flow-transfer-api'
import type {
  FlowTransferEmployeeOption,
  FlowTransferForm,
  FlowTransferLocationOption,
  FlowTransferMaterialOption,
} from '../contracts/flow-transfer'
import { createEmptyFlowTransferForm, flowTransferFormError } from '../model/flow-transfer-view'
import FlowTransferEntryDialog from './FlowTransferEntryDialog'

export default function FlowTransferQuickDialog({
  sourceLocationId,
  materialId,
  canConfirm,
  onMessage,
  onClose,
  onInventoryChanged,
}: {
  sourceLocationId: string
  materialId: string
  canConfirm: boolean
  onMessage: (message: string) => void
  onClose: () => void
  onInventoryChanged: () => void | Promise<void>
}) {
  const [materials, setMaterials] = useState<FlowTransferMaterialOption[]>([])
  const [locations, setLocations] = useState<FlowTransferLocationOption[]>([])
  const [employees, setEmployees] = useState<FlowTransferEmployeeOption[]>([])
  const [form, setForm] = useState<FlowTransferForm>(() => ({
    ...createEmptyFlowTransferForm(),
    materialId,
    sourceLocationId,
  }))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    loadFlowTransfers(new URLSearchParams()).then((workspace) => {
      if (!active) return
      setMaterials(workspace.materials)
      setLocations(workspace.locations)
      setEmployees(workspace.employees)
    }).catch((error) => {
      if (!active) return
      setLoadError(error instanceof Error ? error.message : '获取流程转移选项失败')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === form.materialId) || null,
    [form.materialId, materials],
  )
  const sourceAvailable = selectedMaterial?.stock?.locationBalances.find(
    (balance) => balance.locationId === form.sourceLocationId,
  )?.availableQty || 0

  const submit = async () => {
    const validationError = flowTransferFormError(form)
    if (validationError) return onMessage(validationError)
    if (form.quantity > sourceAvailable) return onMessage('转移数量超过来源库位当前可用数量')

    setSaving(true)
    try {
      const created = await saveFlowTransfer(form)
      if (!canConfirm) {
        onMessage(`${created.message || '流程转移草稿已创建'}；请到“流程转移”页面确认后再移动库存`)
        onClose()
        return
      }
      try {
        const confirmedMessage = await confirmFlowTransfer(created.transfer.id)
        onMessage(confirmedMessage || `流程转移 ${created.transfer.transferNo} 已确认`)
        await onInventoryChanged()
        onClose()
      } catch (error) {
        onMessage(`转移草稿 ${created.transfer.transferNo} 已保存，但确认失败：${error instanceof Error ? error.message : '请到流程转移页面继续处理'}`)
        onClose()
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '创建流程转移失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadError) {
    return (
      <ModalDialog title="从仓库白板发起流程转移" onClose={onClose} closeDisabled={loading} size="lg">
        {loading
          ? <AppLoadingIndicator label="正在加载物料、库位和员工选项..." />
          : <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>}
      </ModalDialog>
    )
  }

  return (
    <FlowTransferEntryDialog
      title="从仓库白板发起流程转移"
      description={canConfirm ? '创建转移单并立即确认库存移动' : '当前账号只能创建草稿，确认后才会移动库存'}
      form={form}
      materials={materials}
      locations={locations}
      employees={employees}
      saving={saving}
      confirmLabel={canConfirm ? '创建并确认转移' : '保存转移草稿'}
      materialLocked
      sourceLocationLocked
      onChange={setForm}
      onCancel={onClose}
      onConfirm={submit}
    />
  )
}
