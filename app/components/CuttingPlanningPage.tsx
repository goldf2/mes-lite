'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calculator, CalendarClock, ListChecks, Scissors, Settings2 } from 'lucide-react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'

interface CuttingDemand {
  id: string
  demandNo: string
  status: string
  outputCodeSnapshot: string
  outputNameSnapshot: string
  rawMaterialCodeSnapshot: string
  rawMaterialNameSnapshot: string
  rawMaterialSpecSnapshot?: string | null
  pieceLengthMm: number
  requiredQty: number
  plannedQty: number
  completedQty: number
  unit: string
  kerfMm: number
  headTrimMm: number
  tailTrimMm: number
  clampDeadZoneMm: number
  tolerancePlusMm: number
  toleranceMinusMm: number
  dueDate?: string | null
  ruleWarnings?: string | null
  productionOrder: {
    id: string
    orderNo: string
    voucherNo?: string | null
    status: string
    dueDate?: string | null
  }
  rawMaterial: {
    id: string
    code: string
    name: string
    spec?: string | null
  }
}

interface ProfileEntity {
  id: string
  entityNo: string
  entityType: string
  actualLengthMm: number
  availableQty: number
  reservedQty: number
  status: string
  isRemnant: boolean
  reusable: boolean
  batchNo?: string | null
  location?: string | null
}

interface ProductionOrderOption {
  id: string
  orderNo: string
  voucherNo?: string | null
  status: string
  planQty: number
  targetMaterial?: { code: string; name: string } | null
  product: { sku: string; name: string }
}

interface CuttingPlan {
  id: string
  planNo: string
  status: string
  totalPlannedQty: number
  totalSourceQty: number
  totalExpectedRemnantMm: number
  utilizationRate: number
  confirmedAt: string
  confirmedBy?: string | null
  cancelReason?: string | null
  demandLines: Array<{
    id: string
    requestedQty: number
    plannedQty: number
    demand: {
      id: string
      demandNo: string
      outputCodeSnapshot: string
      outputNameSnapshot: string
      rawMaterialCodeSnapshot: string
      pieceLengthMm: number
    }
  }>
  sources: Array<{
    id: string
    sourceUnitIndex: number
    sourceLengthMm: number
    plannedCutQty: number
    expectedRemnantLengthMm: number
    utilizationRate: number
    entity: { id: string; entityNo: string; actualLengthMm: number; location?: string | null }
  }>
}

interface ManufacturingConfig {
  requireIndividualMeasurement: boolean | null
  allowMixedOrders: boolean | null
  kerfMm: number | null
  headTrimMm: number | null
  tailTrimMm: number | null
  clampDeadZoneMm: number | null
  minReusableRemnantLengthMm: number | null
}

type Rules = {
  kerfMm: number
  headTrimMm: number
  tailTrimMm: number
  clampDeadZoneMm: number
}

const statusLabels: Record<string, string> = {
  OPEN: '待排样',
  PARTIALLY_PLANNED: '部分排样',
  PLANNED: '已排样',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  CONFIRMED: '已确认',
}

const statusClasses: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700',
  PARTIALLY_PLANNED: 'bg-amber-50 text-amber-700',
  PLANNED: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-red-50 text-red-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
}

function round(value: number, digits = 2) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

function nullableNumber(value: string) {
  return value.trim() === '' ? null : Math.max(0, Number(value))
}

export default function CuttingPlanningPage({
  onMessage,
  canUpdate,
}: {
  onMessage: (message: string) => void
  canUpdate: boolean
}) {
  const [demands, setDemands] = useState<CuttingDemand[]>([])
  const [entities, setEntities] = useState<ProfileEntity[]>([])
  const [orders, setOrders] = useState<ProductionOrderOption[]>([])
  const [plans, setPlans] = useState<CuttingPlan[]>([])
  const [selectedDemandId, setSelectedDemandId] = useState('')
  const [selectedQtyByEntity, setSelectedQtyByEntity] = useState<Record<string, number>>({})
  const [requestedQty, setRequestedQty] = useState(0)
  const [rules, setRules] = useState<Rules>({ kerfMm: 0, headTrimMm: 0, tailTrimMm: 0, clampDeadZoneMm: 0 })
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('OPEN,PARTIALLY_PLANNED')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({ openDemandCount: 0, remainingQty: 0 })
  const [showGenerate, setShowGenerate] = useState(false)
  const [generationOrderId, setGenerationOrderId] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    requireIndividualMeasurement: '',
    allowMixedOrders: '',
    kerfMm: '',
    headTrimMm: '',
    tailTrimMm: '',
    clampDeadZoneMm: '',
    minReusableRemnantLengthMm: '',
  })
  const [cancelTarget, setCancelTarget] = useState<CuttingPlan | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const selectedDemand = demands.find((item) => item.id === selectedDemandId) || null
  const remainingQty = selectedDemand ? Math.max(0, selectedDemand.requiredQty - selectedDemand.plannedQty) : 0
  const selectedRawMaterialId = selectedDemand?.rawMaterial.id || ''
  const selectedKerfMm = selectedDemand?.kerfMm || 0
  const selectedHeadTrimMm = selectedDemand?.headTrimMm || 0
  const selectedTailTrimMm = selectedDemand?.tailTrimMm || 0
  const selectedClampDeadZoneMm = selectedDemand?.clampDeadZoneMm || 0

  const fetchDemands = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '200' })
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (status) params.set('statuses', status)
    const response = await fetch(`/api/cutting-demands?${params.toString()}`)
    const payload = await response.json()
    if (!response.ok) {
      onMessage(payload.error || '获取切割需求失败')
      return
    }
    setDemands(payload.data || [])
    setSummary(payload.summary || { openDemandCount: 0, remainingQty: 0 })
    setSelectedDemandId((current) => (
      current && (payload.data || []).some((item: CuttingDemand) => item.id === current)
        ? current
        : payload.data?.[0]?.id || ''
    ))
  }, [keyword, status, onMessage])

  const fetchPlans = useCallback(async () => {
    const response = await fetch('/api/cutting-plans?pageSize=30')
    const payload = await response.json()
    if (response.ok) setPlans(payload.data || [])
  }, [])

  const fetchOrders = useCallback(async () => {
    const response = await fetch('/api/orders?pageSize=200')
    const payload = await response.json()
    if (response.ok) {
      setOrders((payload.data || []).filter((item: ProductionOrderOption) => item.status !== 'CANCELLED'))
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    const response = await fetch('/api/manufacturing-config')
    const payload = await response.json()
    if (!response.ok) {
      onMessage(payload.error || '获取切割规则失败')
      return
    }
    const config = payload.data as ManufacturingConfig
    setConfigForm({
      requireIndividualMeasurement: config.requireIndividualMeasurement == null ? '' : String(config.requireIndividualMeasurement),
      allowMixedOrders: config.allowMixedOrders == null ? '' : String(config.allowMixedOrders),
      kerfMm: config.kerfMm == null ? '' : String(config.kerfMm),
      headTrimMm: config.headTrimMm == null ? '' : String(config.headTrimMm),
      tailTrimMm: config.tailTrimMm == null ? '' : String(config.tailTrimMm),
      clampDeadZoneMm: config.clampDeadZoneMm == null ? '' : String(config.clampDeadZoneMm),
      minReusableRemnantLengthMm: config.minReusableRemnantLengthMm == null ? '' : String(config.minReusableRemnantLengthMm),
    })
  }, [onMessage])

  useEffect(() => {
    const timer = window.setTimeout(fetchDemands, 180)
    return () => window.clearTimeout(timer)
  }, [fetchDemands])

  useEffect(() => {
    fetchPlans()
    fetchOrders()
    fetchConfig()
  }, [fetchPlans, fetchOrders, fetchConfig])

  useEffect(() => {
    if (!selectedRawMaterialId) {
      setEntities([])
      setSelectedQtyByEntity({})
      setRequestedQty(0)
      return
    }
    setRequestedQty(remainingQty)
    setRules({
      kerfMm: selectedKerfMm,
      headTrimMm: selectedHeadTrimMm,
      tailTrimMm: selectedTailTrimMm,
      clampDeadZoneMm: selectedClampDeadZoneMm,
    })
    setSelectedQtyByEntity({})
    const loadEntities = async () => {
      const params = new URLSearchParams({
        materialId: selectedRawMaterialId,
        statuses: 'AVAILABLE,REMNANT',
        pageSize: '200',
      })
      const response = await fetch(`/api/profile-stock?${params.toString()}`)
      const payload = await response.json()
      if (response.ok) setEntities((payload.data || []).filter((item: ProfileEntity) => item.availableQty > 0 && item.reusable))
      else onMessageRef.current(payload.error || '获取可用型材实体失败')
    }
    loadEntities()
  }, [
    remainingQty,
    selectedClampDeadZoneMm,
    selectedHeadTrimMm,
    selectedKerfMm,
    selectedRawMaterialId,
    selectedTailTrimMm,
  ])

  const preview = useMemo(() => {
    if (!selectedDemand || requestedQty <= 0) return null
    let remaining = requestedQty
    const sourceRows: Array<{
      entityId: string
      entityNo: string
      sourceUnitIndex: number
      lengthMm: number
      plannedQty: number
      remnantMm: number
      utilization: number
    }> = []
    const fixedLoss = rules.headTrimMm + rules.tailTrimMm + rules.clampDeadZoneMm
    let unusedQty = 0

    for (const entity of entities) {
      const selectedQty = Number(selectedQtyByEntity[entity.id] || 0)
      for (let sourceUnitIndex = 1; sourceUnitIndex <= selectedQty; sourceUnitIndex += 1) {
        if (remaining <= 0) {
          unusedQty += selectedQty - sourceUnitIndex + 1
          break
        }
        const usableLength = Math.max(0, entity.actualLengthMm - fixedLoss)
        const occupiedPerPiece = selectedDemand.pieceLengthMm + rules.kerfMm
        const capacity = occupiedPerPiece > 0 ? Math.floor((usableLength + 0.0000001) / occupiedPerPiece) : 0
        const plannedQty = Math.min(capacity, remaining)
        if (plannedQty <= 0) {
          unusedQty += 1
          continue
        }
        const productLength = plannedQty * selectedDemand.pieceLengthMm
        const kerfLoss = plannedQty * rules.kerfMm
        remaining -= plannedQty
        sourceRows.push({
          entityId: entity.id,
          entityNo: entity.entityNo,
          sourceUnitIndex,
          lengthMm: entity.actualLengthMm,
          plannedQty,
          remnantMm: Math.max(0, usableLength - productLength - kerfLoss),
          utilization: entity.actualLengthMm > 0 ? productLength / entity.actualLengthMm * 100 : 0,
        })
      }
    }
    const sourceLength = sourceRows.reduce((sum, item) => sum + item.lengthMm, 0)
    const productLength = sourceRows.reduce((sum, item) => sum + item.plannedQty * selectedDemand.pieceLengthMm, 0)
    return {
      rows: sourceRows,
      plannedQty: requestedQty - remaining,
      shortageQty: remaining,
      sourceQty: sourceRows.length,
      remnantMm: sourceRows.reduce((sum, item) => sum + item.remnantMm, 0),
      utilization: sourceLength > 0 ? productLength / sourceLength * 100 : 0,
      unusedQty,
    }
  }, [entities, requestedQty, rules, selectedDemand, selectedQtyByEntity])

  const generateDemands = async () => {
    if (!generationOrderId) return onMessage('请选择生产工单')
    setLoading(true)
    try {
      const response = await fetch('/api/cutting-demands/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionOrderId: generationOrderId,
          clientRequestId: window.crypto.randomUUID(),
        }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '生成切割需求失败')
      if (response.ok) {
        setShowGenerate(false)
        setGenerationOrderId('')
        await fetchDemands()
      }
    } finally {
      setLoading(false)
    }
  }

  const confirmPlan = async () => {
    if (!selectedDemand || !preview || preview.plannedQty <= 0) return onMessage('请选择能够切出成品的原料实体')
    const sources = Object.entries(selectedQtyByEntity)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([entityId, selectedQty]) => ({ entityId, selectedQty: Number(selectedQty) }))
    setLoading(true)
    try {
      const response = await fetch('/api/cutting-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: window.crypto.randomUUID(),
          demandLines: [{ demandId: selectedDemand.id, requestedQty }],
          sources,
          rules,
        }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '确认排样失败')
      if (response.ok) {
        setSelectedQtyByEntity({})
        await Promise.all([fetchDemands(), fetchPlans()])
      }
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setLoading(true)
    try {
      const booleanValue = (value: string) => value === '' ? null : value === 'true'
      const response = await fetch('/api/manufacturing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireIndividualMeasurement: booleanValue(configForm.requireIndividualMeasurement),
          allowMixedOrders: booleanValue(configForm.allowMixedOrders),
          kerfMm: nullableNumber(configForm.kerfMm),
          headTrimMm: nullableNumber(configForm.headTrimMm),
          tailTrimMm: nullableNumber(configForm.tailTrimMm),
          clampDeadZoneMm: nullableNumber(configForm.clampDeadZoneMm),
          minReusableRemnantLengthMm: nullableNumber(configForm.minReusableRemnantLengthMm),
        }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '保存切割规则失败')
      if (response.ok) setShowConfig(false)
    } finally {
      setLoading(false)
    }
  }

  const cancelPlan = async () => {
    if (!cancelTarget || cancelReason.trim().length < 2) return onMessage('请输入取消原因')
    setLoading(true)
    try {
      const response = await fetch(`/api/cutting-plans/${cancelTarget.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '取消排样失败')
      if (response.ok) {
        setCancelTarget(null)
        setCancelReason('')
        await Promise.all([fetchDemands(), fetchPlans()])
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索需求号、工单、成品或原料"
              className="w-full min-w-[220px] max-w-[380px] rounded-lg border border-gray-200 px-4 py-2 text-sm"
            />
          )}
          filters={(
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="OPEN,PARTIALLY_PLANNED">待排样 / 部分排样</option>
              <option value="PLANNED">已排样</option>
              <option value="">全部状态</option>
            </select>
          )}
          actions={(
            <>
              {canUpdate && (
                <button onClick={() => setShowConfig(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Settings2 className="h-4 w-4" />切割规则
                </button>
              )}
              <button onClick={() => setShowGenerate(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <ListChecks className="h-4 w-4" />从工单生成
              </button>
            </>
          )}
        />
      </TopBarPortal>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="text-sm text-blue-700">待排样需求</div>
            <div className="mt-2 text-2xl font-semibold text-blue-900">{summary.openDemandCount}</div>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
            <div className="text-sm text-amber-700">剩余待排数量</div>
            <div className="mt-2 text-2xl font-semibold text-amber-900">{summary.remainingQty}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">最近排样方案</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{plans.length}</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="font-semibold text-gray-900">切割需求</h2>
              <p className="mt-1 text-xs text-gray-500">需求来自工单创建时冻结的 BOM 快照</p>
            </div>
            <div className="max-h-[680px] divide-y divide-gray-100 overflow-y-auto">
              {demands.map((demand) => {
                const selected = demand.id === selectedDemandId
                return (
                  <button
                    key={demand.id}
                    type="button"
                    onClick={() => setSelectedDemandId(demand.id)}
                    className={`block w-full p-4 text-left transition ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-sm font-semibold text-blue-700">{demand.demandNo}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${statusClasses[demand.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[demand.status] || demand.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-900">{demand.outputCodeSnapshot} · {demand.outputNameSnapshot}</div>
                    <div className="mt-1 text-xs text-gray-500">工单 {demand.productionOrder.orderNo} · 原料 {demand.rawMaterialCodeSnapshot}</div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">{round(demand.pieceLengthMm, 2)} mm</span>
                      <span>已排 {demand.plannedQty} / {demand.requiredQty}</span>
                    </div>
                  </button>
                )
              })}
              {demands.length === 0 && <div className="p-10 text-center text-sm text-gray-500">暂无切割需求；先维护 BOM 成品切长，再从工单生成。</div>}
            </div>
          </section>

          <section className="min-w-0 space-y-4">
            {selectedDemand ? (
              <>
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">人工排样 · {selectedDemand.demandNo}</h2>
                      <div className="mt-1 text-sm text-gray-500">
                        {selectedDemand.rawMaterialCodeSnapshot} · {selectedDemand.rawMaterialNameSnapshot}
                        {selectedDemand.rawMaterialSpecSnapshot ? ` · ${selectedDemand.rawMaterialSpecSnapshot}` : ''}
                      </div>
                    </div>
                    {selectedDemand.dueDate && (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <CalendarClock className="h-4 w-4" />交期 {new Date(selectedDemand.dueDate).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm text-gray-600">
                      本次排样数量
                      <input type="number" min={1} max={remainingQty} value={requestedQty || ''} onChange={(event) => setRequestedQty(Math.min(remainingQty, Math.max(1, Number(event.target.value))))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900" />
                    </label>
                    {[
                      ['kerfMm', '锯缝 mm'],
                      ['headTrimMm', '首端切除 mm'],
                      ['tailTrimMm', '尾端切除 mm'],
                      ['clampDeadZoneMm', '夹持死区 mm'],
                    ].map(([key, label]) => (
                      <label key={key} className="text-sm text-gray-600">
                        {label}
                        <input type="number" min={0} step="0.1" value={rules[key as keyof Rules]} onChange={(event) => setRules({ ...rules, [key]: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900" />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-gray-500">
                    成品切长 {round(selectedDemand.pieceLengthMm, 3)} mm · 公差 +{round(selectedDemand.tolerancePlusMm, 3)} / -{round(selectedDemand.toleranceMinusMm, 3)} mm
                  </div>
                  {selectedDemand.ruleWarnings && (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                      本需求生成时存在未确认参数，已按 0 mm 固化；可在本次排样上方明确覆盖。
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
                      <tr>
                        <th className="px-4 py-3">原料实体</th>
                        <th className="px-4 py-3">实际长度</th>
                        <th className="px-4 py-3">可用根数</th>
                        <th className="px-4 py-3">单根最大可切</th>
                        <th className="px-4 py-3">预计单根余料</th>
                        <th className="px-4 py-3">选择根数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {entities.map((entity) => {
                        const fixedLoss = rules.headTrimMm + rules.tailTrimMm + rules.clampDeadZoneMm
                        const occupied = selectedDemand.pieceLengthMm + rules.kerfMm
                        const capacity = occupied > 0 ? Math.max(0, Math.floor((entity.actualLengthMm - fixedLoss + 0.0000001) / occupied)) : 0
                        const remnant = Math.max(0, entity.actualLengthMm - fixedLoss - capacity * occupied)
                        return (
                          <tr key={entity.id} className={selectedQtyByEntity[entity.id] ? 'bg-blue-50/60' : 'hover:bg-gray-50'}>
                            <td className="px-4 py-3">
                              <div className="font-mono font-medium text-blue-700">{entity.entityNo}</div>
                              <div className="mt-1 text-xs text-gray-500">{entity.isRemnant ? '余料' : entity.entityType === 'SINGLE' ? '单根' : '同长批次'} · {entity.location || '未指定库位'}</div>
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{round(entity.actualLengthMm, 2)} mm</td>
                            <td className="px-4 py-3">{entity.availableQty}</td>
                            <td className={`px-4 py-3 font-semibold ${capacity > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{capacity} 件</td>
                            <td className="px-4 py-3">{capacity > 0 ? `${round(remnant, 2)} mm` : '长度不足'}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min={0}
                                max={entity.availableQty}
                                step={1}
                                disabled={capacity <= 0}
                                value={selectedQtyByEntity[entity.id] || ''}
                                onChange={(event) => setSelectedQtyByEntity({
                                  ...selectedQtyByEntity,
                                  [entity.id]: Math.min(entity.availableQty, Math.max(0, Math.floor(Number(event.target.value)))),
                                })}
                                className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-right disabled:bg-gray-100"
                              />
                            </td>
                          </tr>
                        )
                      })}
                      {entities.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">该型材规格暂无可用实体，请先完成来料实测入库。</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">实时计算结果</h3>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ['计划切件', `${preview?.plannedQty || 0} 件`],
                      ['选用原料', `${preview?.sourceQty || 0} 根`],
                      ['材料利用率', `${round(preview?.utilization || 0, 2)}%`],
                      ['预计余料合计', `${round(preview?.remnantMm || 0, 2)} mm`],
                      ['不足数量', `${preview?.shortageQty || 0} 件`],
                    ].map(([label, value], index) => (
                      <div key={label} className={`rounded-lg p-3 ${index === 4 && (preview?.shortageQty || 0) > 0 ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-900'}`}>
                        <div className="text-xs opacity-70">{label}</div>
                        <div className="mt-1 text-xl font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  {preview && preview.rows.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                      {preview.rows.map((row) => (
                        <span key={`${row.entityId}-${row.sourceUnitIndex}`} className="rounded bg-gray-100 px-2 py-1">
                          {row.entityNo}#{row.sourceUnitIndex}：{row.plannedQty} 件，余 {round(row.remnantMm, 1)} mm
                        </span>
                      ))}
                    </div>
                  )}
                  {preview && preview.unusedQty > 0 && <div className="mt-3 text-sm text-amber-700">有 {preview.unusedQty} 根选择后未使用，确认时不会占用。</div>}
                  <div className="mt-5 flex justify-end">
                    <button disabled={loading || !preview || preview.plannedQty <= 0} onClick={confirmPlan} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                      <Scissors className="h-4 w-4" />{preview?.shortageQty ? '确认部分排样' : '确认排样并占用实体'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white p-16 text-center text-gray-500">请选择一条切割需求。</div>
            )}
          </section>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">最近排样方案</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {plans.map((plan) => (
              <details key={plan.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-mono font-semibold text-blue-700">{plan.planNo}</span>
                    <span className={`ml-2 rounded px-2 py-0.5 text-xs ${statusClasses[plan.status] || 'bg-gray-100'}`}>{statusLabels[plan.status] || plan.status}</span>
                    <div className="mt-1 text-xs text-gray-500">{new Date(plan.confirmedAt).toLocaleString('zh-CN')} · {plan.confirmedBy || '-'}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    <span>{plan.totalPlannedQty} 件</span>
                    <span>{plan.totalSourceQty} 根</span>
                    <span>利用率 {round(plan.utilizationRate, 2)}%</span>
                    <span>预计余料 {round(plan.totalExpectedRemnantMm, 1)} mm</span>
                    {canUpdate && plan.status === 'CONFIRMED' && (
                      <button type="button" onClick={(event) => { event.preventDefault(); setCancelTarget(plan) }} className="rounded border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">取消排样</button>
                    )}
                  </div>
                </summary>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {plan.sources.map((source) => (
                    <div key={source.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                      <div className="font-mono text-blue-700">{source.entity.entityNo}#{source.sourceUnitIndex}</div>
                      <div className="mt-1 text-gray-600">{source.sourceLengthMm} mm → {source.plannedCutQty} 件 → 余 {round(source.expectedRemnantLengthMm, 2)} mm</div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {plans.length === 0 && <div className="p-10 text-center text-sm text-gray-500">暂无已确认排样方案。</div>}
          </div>
        </section>
      </div>

      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">从生产工单生成切割需求</h3>
              <button onClick={() => setShowGenerate(false)} className="text-2xl text-gray-400">×</button>
            </div>
            <p className="mt-2 text-sm text-gray-500">系统读取工单冻结的 BOM 快照；只有已启用型材实体追踪并填写成品切长的 BOM 原料会生成需求。</p>
            <select value={generationOrderId} onChange={(event) => setGenerationOrderId(event.target.value)} className="mt-5 w-full rounded-lg border border-gray-200 px-3 py-2">
              <option value="">请选择生产工单</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNo} · {order.targetMaterial?.code || order.product.sku} · {order.targetMaterial?.name || order.product.name} · {order.planQty} 件
                </option>
              ))}
            </select>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowGenerate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
              <button disabled={loading || !generationOrderId} onClick={generateDemands} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">生成需求</button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">制造切割规则</h3>
              <button onClick={() => setShowConfig(false)} className="text-2xl text-gray-400">×</button>
            </div>
            <p className="mt-2 text-sm text-gray-500">空值表示业务参数尚未确认；系统生成需求时会明确记录“按 0 mm 计算”的警告，不硬编码默认值。</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ['kerfMm', '锯缝 mm'],
                ['headTrimMm', '首端切除 mm'],
                ['tailTrimMm', '尾端切除 mm'],
                ['clampDeadZoneMm', '夹持死区 mm'],
                ['minReusableRemnantLengthMm', '余料最小回库长度 mm'],
              ].map(([key, label]) => (
                <label key={key} className="text-sm text-gray-700">
                  {label}
                  <input value={configForm[key as keyof typeof configForm]} onChange={(event) => setConfigForm({ ...configForm, [key]: event.target.value })} type="number" min={0} step="0.1" placeholder="待确认" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
                </label>
              ))}
              <label className="text-sm text-gray-700">
                是否逐根实测
                <select value={configForm.requireIndividualMeasurement} onChange={(event) => setConfigForm({ ...configForm, requireIndividualMeasurement: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                  <option value="">待确认</option><option value="true">是</option><option value="false">否，可同长批量</option>
                </select>
              </label>
              <label className="text-sm text-gray-700">
                是否允许混单切割
                <select value={configForm.allowMixedOrders} onChange={(event) => setConfigForm({ ...configForm, allowMixedOrders: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                  <option value="">待确认（按禁止处理）</option><option value="true">允许</option><option value="false">禁止</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowConfig(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
              <button disabled={loading} onClick={saveConfig} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存规则</button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">取消排样方案</h3>
              <button onClick={() => setCancelTarget(null)} className="text-2xl text-gray-400">×</button>
            </div>
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{cancelTarget.planNo} 的实体占用将被释放，并恢复需求待排数量。</div>
            <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="请输入取消原因" className="mt-4 min-h-24 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setCancelTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">返回</button>
              <button disabled={loading || cancelReason.trim().length < 2} onClick={cancelPlan} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">确认取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
