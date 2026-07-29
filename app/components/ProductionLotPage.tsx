'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleCheckBig, Drill, PackageCheck, RotateCcw, Search } from 'lucide-react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'

interface DrillingReport {
  id: string
  reportNo: string
  status: string
  operationType: string
  inputQty: number
  goodQty: number
  reworkQty: number
  scrapQty: number
  holeType?: string | null
  drawingNo?: string | null
  completedAt: string
  reverseReason?: string | null
}

interface QualityInspection {
  id: string
  inspectionNo: string
  status: string
  inspectionType: string
  inputQty: number
  sampleQty: number
  passedQty: number
  reworkQty: number
  scrapQty: number
  result: string
  inspectorName: string
  checkedAt: string
  reverseReason?: string | null
}

interface StockIn {
  id: string
  status: string
  qty: number
  batchNo?: string | null
  inDate: string
  inBy?: string | null
  costAmount: number
  reverseReason?: string | null
}

interface ProductionLot {
  id: string
  lotNo: string
  status: string
  requiresDrilling: boolean
  cutGoodQty: number
  pendingDrillingQty: number
  pendingQcQty: number
  reworkQty: number
  passedQty: number
  scrappedQty: number
  stockedQty: number
  materialCostAmount: number
  unitMaterialCost: number
  drillingSpecSnapshot?: string | null
  outputMaterial: {
    code: string
    name: string
    spec?: string | null
    stockUnit: string
  }
  productionOrder: {
    orderNo: string
    voucherNo?: string | null
    status: string
  }
  cuttingDemand: {
    demandNo: string
    pieceLengthMm: number
    rawMaterialCodeSnapshot: string
  }
  cuttingTask: {
    taskNo: string
    sources: Array<{
      sourceEntity: { entityNo: string; batchNo?: string | null }
      remnantEntity?: { entityNo: string; actualLengthMm: number } | null
    }>
  }
  drillingReports: DrillingReport[]
  qualityInspections: QualityInspection[]
  stockIns: StockIn[]
}

type ActionMode = 'DRILLING' | 'QUALITY' | 'STOCK_IN'

const statusLabels: Record<string, string> = {
  WAITING_DRILLING: '待钻孔',
  WAITING_QC: '待质检',
  REWORK_PENDING: '待返工',
  WAITING_STOCK_IN: '待入库',
  COMPLETED: '已完成',
  SCRAPPED: '已报废',
  IN_PROGRESS: '处理中',
  REVERSED: '已冲销',
}

const statusClasses: Record<string, string> = {
  WAITING_DRILLING: 'bg-blue-50 text-blue-700',
  WAITING_QC: 'bg-violet-50 text-violet-700',
  REWORK_PENDING: 'bg-amber-50 text-amber-700',
  WAITING_STOCK_IN: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
  SCRAPPED: 'bg-red-50 text-red-700',
  IN_PROGRESS: 'bg-sky-50 text-sky-700',
  REVERSED: 'bg-gray-100 text-gray-500',
}

function numberText(value: number, digits = 2) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

export default function ProductionLotPage({
  onMessage,
  canCreate,
  canUpdate,
}: {
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
}) {
  const [lots, setLots] = useState<ProductionLot[]>([])
  const [summary, setSummary] = useState({
    waitingDrillingQty: 0,
    waitingQcQty: 0,
    reworkQty: 0,
    availableStockInQty: 0,
  })
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionLot, setActionLot] = useState<ProductionLot | null>(null)
  const [actionMode, setActionMode] = useState<ActionMode | null>(null)
  const [drillingForm, setDrillingForm] = useState({
    operationType: 'INITIAL' as 'INITIAL' | 'REWORK',
    inputQty: 0,
    goodQty: 0,
    reworkQty: 0,
    scrapQty: 0,
    holeType: '',
    drawingNo: '',
    note: '',
  })
  const [qualityForm, setQualityForm] = useState({
    sourceBucket: 'QC_PENDING' as 'QC_PENDING' | 'REWORK_PENDING',
    inputQty: 0,
    sampleQty: 0,
    passedQty: 0,
    reworkQty: 0,
    scrapQty: 0,
    badReason: '',
    note: '',
  })
  const [stockInForm, setStockInForm] = useState({ qty: 0, batchNo: '', note: '' })

  const fetchLots = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' })
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (status) params.set('status', status)
    const response = await fetch(`/api/production-lots?${params.toString()}`)
    const payload = await response.json()
    if (!response.ok) return onMessage(payload.error || '获取生产批次失败')
    setLots(payload.data || [])
    setSummary(payload.summary || {
      waitingDrillingQty: 0,
      waitingQcQty: 0,
      reworkQty: 0,
      availableStockInQty: 0,
    })
  }, [keyword, onMessage, status])

  useEffect(() => {
    const timer = window.setTimeout(fetchLots, 180)
    return () => window.clearTimeout(timer)
  }, [fetchLots])

  const totalActiveQty = useMemo(() => (
    summary.waitingDrillingQty + summary.waitingQcQty + summary.reworkQty + summary.availableStockInQty
  ), [summary])

  const openDrilling = (lot: ProductionLot, operationType?: 'INITIAL' | 'REWORK') => {
    const type = operationType || (lot.pendingDrillingQty > 0 ? 'INITIAL' : 'REWORK')
    const inputQty = type === 'INITIAL' ? lot.pendingDrillingQty : lot.reworkQty
    setActionLot(lot)
    setActionMode('DRILLING')
    setDrillingForm({
      operationType: type,
      inputQty,
      goodQty: inputQty,
      reworkQty: 0,
      scrapQty: 0,
      holeType: '',
      drawingNo: '',
      note: '',
    })
  }

  const openQuality = (lot: ProductionLot, sourceBucket?: 'QC_PENDING' | 'REWORK_PENDING') => {
    const bucket = sourceBucket || (lot.pendingQcQty > 0 ? 'QC_PENDING' : 'REWORK_PENDING')
    const inputQty = bucket === 'QC_PENDING' ? lot.pendingQcQty : lot.reworkQty
    setActionLot(lot)
    setActionMode('QUALITY')
    setQualityForm({
      sourceBucket: bucket,
      inputQty,
      sampleQty: inputQty,
      passedQty: inputQty,
      reworkQty: 0,
      scrapQty: 0,
      badReason: '',
      note: '',
    })
  }

  const openStockIn = (lot: ProductionLot) => {
    const qty = Math.max(0, lot.passedQty - lot.stockedQty)
    setActionLot(lot)
    setActionMode('STOCK_IN')
    setStockInForm({ qty, batchNo: '', note: '' })
  }

  const closeAction = () => {
    setActionLot(null)
    setActionMode(null)
  }

  const submitAction = async () => {
    if (!actionLot || !actionMode) return
    setLoading(true)
    try {
      let url = ''
      let body: Record<string, unknown> = { clientRequestId: window.crypto.randomUUID() }
      if (actionMode === 'DRILLING') {
        url = `/api/production-lots/${actionLot.id}/drilling`
        body = { ...body, ...drillingForm }
      } else if (actionMode === 'QUALITY') {
        url = `/api/production-lots/${actionLot.id}/quality`
        body = { ...body, ...qualityForm }
      } else {
        url = `/api/production-lots/${actionLot.id}/stock-in`
        body = { ...body, ...stockInForm }
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '操作失败')
      if (response.ok) {
        closeAction()
        await fetchLots()
      }
    } finally {
      setLoading(false)
    }
  }

  const reverseRecord = async (
    lot: ProductionLot,
    type: 'drilling' | 'quality' | 'stock-in',
    recordId: string,
    label: string,
  ) => {
    const reason = window.prompt(`请输入冲销 ${label} 的原因`)
    if (!reason || reason.trim().length < 2) return
    const segment = type === 'drilling'
      ? `drilling/${recordId}`
      : type === 'quality' ? `quality/${recordId}` : `stock-in/${recordId}`
    setLoading(true)
    try {
      const response = await fetch(`/api/production-lots/${lot.id}/${segment}/reverse`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '冲销失败')
      if (response.ok) await fetchLots()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <div className="relative w-full min-w-[220px] max-w-[380px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索批次、工单、成品或锯切任务" className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm" />
            </div>
          )}
          filters={(
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">全部状态</option>
              <option value="WAITING_DRILLING">待钻孔</option>
              <option value="WAITING_QC">待质检</option>
              <option value="REWORK_PENDING">待返工</option>
              <option value="WAITING_STOCK_IN">待入库</option>
              <option value="COMPLETED">已完成</option>
              <option value="REVERSED">已冲销</option>
            </select>
          )}
        />
      </TopBarPortal>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['待钻孔', summary.waitingDrillingQty, 'border-blue-100 bg-blue-50 text-blue-900'],
            ['待质检', summary.waitingQcQty, 'border-violet-100 bg-violet-50 text-violet-900'],
            ['待返工', summary.reworkQty, 'border-amber-100 bg-amber-50 text-amber-900'],
            ['质检合格待入库', summary.availableStockInQty, 'border-emerald-100 bg-emerald-50 text-emerald-900'],
          ].map(([label, value, className]) => (
            <div key={String(label)} className={`rounded-lg border p-4 ${className}`}>
              <div className="text-sm opacity-75">{label}</div>
              <div className="mt-2 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>

        <section className="space-y-3">
          {lots.map((lot) => {
            const availableStockInQty = Math.max(0, lot.passedQty - lot.stockedQty)
            return (
              <article key={lot.id} className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-blue-700">{lot.lotNo}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${statusClasses[lot.status] || 'bg-gray-100 text-gray-600'}`}>{statusLabels[lot.status] || lot.status}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${lot.requiresDrilling ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {lot.requiresDrilling ? '需要钻孔' : '免钻孔'}
                      </span>
                    </div>
                    <h2 className="mt-2 font-semibold text-gray-900">{lot.outputMaterial.code} · {lot.outputMaterial.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      工单 {lot.productionOrder.orderNo} · 锯切任务 {lot.cuttingTask.taskNo} · 切长 {numberText(lot.cuttingDemand.pieceLengthMm)} mm
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      来源实体 {Array.from(new Set(lot.cuttingTask.sources.map((source) => source.sourceEntity.entityNo))).join('、') || '-'}
                    </p>
                  </div>
                  {canCreate && lot.status !== 'REVERSED' && (
                    <div className="flex flex-wrap gap-2">
                      {lot.requiresDrilling && lot.pendingDrillingQty > 0 && (
                        <button onClick={() => openDrilling(lot, 'INITIAL')} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">
                          <Drill className="h-4 w-4" />钻孔报工
                        </button>
                      )}
                      {lot.requiresDrilling && lot.reworkQty > 0 && (
                        <button onClick={() => openDrilling(lot, 'REWORK')} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50">
                          <Drill className="h-4 w-4" />钻孔返工
                        </button>
                      )}
                      {lot.pendingQcQty > 0 && (
                        <button onClick={() => openQuality(lot, 'QC_PENDING')} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
                          <CircleCheckBig className="h-4 w-4" />质检
                        </button>
                      )}
                      {lot.reworkQty > 0 && (
                        <button onClick={() => openQuality(lot, 'REWORK_PENDING')} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50">
                          <CircleCheckBig className="h-4 w-4" />返工复检
                        </button>
                      )}
                      {availableStockInQty > 0 && (
                        <button onClick={() => openStockIn(lot)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                          <PackageCheck className="h-4 w-4" />成品入库
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
                  {[
                    ['锯切合格', lot.cutGoodQty, 'text-gray-900'],
                    ['待钻孔', lot.pendingDrillingQty, 'text-blue-700'],
                    ['待质检', lot.pendingQcQty, 'text-violet-700'],
                    ['待返工', lot.reworkQty, 'text-amber-700'],
                    ['质检合格', lot.passedQty, 'text-emerald-700'],
                    ['报废', lot.scrappedQty, 'text-red-700'],
                    ['已入库', lot.stockedQty, 'text-gray-900'],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)} className="rounded-lg bg-gray-50 p-3 text-sm">
                      <div className="text-xs text-gray-500">{label}</div>
                      <div className={`mt-1 font-semibold ${tone}`}>{value}</div>
                    </div>
                  ))}
                </div>

                <details className="mt-4 border-t border-gray-100 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-blue-700">
                    查看加工、质检与入库记录（{lot.drillingReports.length + lot.qualityInspections.length + lot.stockIns.length}）
                  </summary>
                  <div className="mt-3 space-y-2">
                    {lot.drillingReports.map((report) => (
                      <div key={report.id} className="flex flex-col gap-2 rounded-lg bg-blue-50/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="font-mono text-blue-700">{report.reportNo}</span>
                          <span className="ml-2">钻孔{report.operationType === 'REWORK' ? '返工' : ''}：投入 {report.inputQty}，合格 {report.goodQty}，返工 {report.reworkQty}，报废 {report.scrapQty}</span>
                          {report.holeType && <span className="ml-2 text-gray-500">孔型 {report.holeType}</span>}
                          {report.status === 'REVERSED' && <span className="ml-2 text-red-600">已冲销</span>}
                        </div>
                        {canUpdate && report.status === 'CONFIRMED' && (
                          <button disabled={loading} onClick={() => reverseRecord(lot, 'drilling', report.id, report.reportNo)} className="inline-flex items-center gap-1 text-xs text-red-600">
                            <RotateCcw className="h-3.5 w-3.5" />冲销
                          </button>
                        )}
                      </div>
                    ))}
                    {lot.qualityInspections.map((inspection) => (
                      <div key={inspection.id} className="flex flex-col gap-2 rounded-lg bg-violet-50/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="font-mono text-violet-700">{inspection.inspectionNo}</span>
                          <span className="ml-2">质检：数量 {inspection.inputQty}，合格 {inspection.passedQty}，返工 {inspection.reworkQty}，报废 {inspection.scrapQty}</span>
                          <span className="ml-2 text-gray-500">{inspection.inspectorName}</span>
                          {inspection.status === 'REVERSED' && <span className="ml-2 text-red-600">已冲销</span>}
                        </div>
                        {canUpdate && inspection.status === 'CONFIRMED' && (
                          <button disabled={loading} onClick={() => reverseRecord(lot, 'quality', inspection.id, inspection.inspectionNo)} className="inline-flex items-center gap-1 text-xs text-red-600">
                            <RotateCcw className="h-3.5 w-3.5" />冲销
                          </button>
                        )}
                      </div>
                    ))}
                    {lot.stockIns.map((stockIn) => (
                      <div key={stockIn.id} className="flex flex-col gap-2 rounded-lg bg-emerald-50/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="font-medium text-emerald-700">成品入库 {stockIn.qty} {lot.outputMaterial.stockUnit}</span>
                          <span className="ml-2">批次 {stockIn.batchNo || '-'}</span>
                          <span className="ml-2 text-gray-500">成本 ¥{numberText(stockIn.costAmount, 4)}</span>
                          {stockIn.status === 'REVERSED' && <span className="ml-2 text-red-600">已冲销</span>}
                        </div>
                        {canUpdate && stockIn.status === 'CONFIRMED' && (
                          <button disabled={loading} onClick={() => reverseRecord(lot, 'stock-in', stockIn.id, `入库 ${stockIn.batchNo || stockIn.id}`)} className="inline-flex items-center gap-1 text-xs text-red-600">
                            <RotateCcw className="h-3.5 w-3.5" />冲销
                          </button>
                        )}
                      </div>
                    ))}
                    {lot.drillingReports.length + lot.qualityInspections.length + lot.stockIns.length === 0 && (
                      <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">暂无后续记录。</div>
                    )}
                  </div>
                </details>
              </article>
            )
          })}
          {lots.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
              暂无生产批次。锯切任务合格完工后会自动生成。
            </div>
          )}
        </section>

        {actionLot && actionMode && (
          <section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {actionMode === 'DRILLING' ? '钻孔报工' : actionMode === 'QUALITY' ? '质量检验' : '质检合格品入库'} · {actionLot.lotNo}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{actionLot.outputMaterial.code} · {actionLot.outputMaterial.name}</p>
              </div>
              <button onClick={closeAction} className="text-sm text-gray-500 hover:text-gray-900">关闭</button>
            </div>

            {actionMode === 'DRILLING' && (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="text-sm text-gray-600">操作类型
                  <select value={drillingForm.operationType} disabled className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900">
                    <option value="INITIAL">初次钻孔</option>
                    <option value="REWORK">返工钻孔</option>
                  </select>
                </label>
                {[
                  ['inputQty', '投入数量'],
                  ['goodQty', '合格数量'],
                  ['reworkQty', '返工数量'],
                  ['scrapQty', '报废数量'],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm text-gray-600">{label}
                    <input type="number" min={0} step={1} value={drillingForm[field as keyof typeof drillingForm] as number} onChange={(event) => setDrillingForm({ ...drillingForm, [field]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900" />
                  </label>
                ))}
                <label className="text-sm text-gray-600">孔型
                  <input value={drillingForm.holeType} onChange={(event) => setDrillingForm({ ...drillingForm, holeType: event.target.value })} placeholder="例如：Φ5 通孔" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
                <label className="text-sm text-gray-600">图纸号
                  <input value={drillingForm.drawingNo} onChange={(event) => setDrillingForm({ ...drillingForm, drawingNo: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
                <label className="text-sm text-gray-600 md:col-span-2">备注
                  <input value={drillingForm.note} onChange={(event) => setDrillingForm({ ...drillingForm, note: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
              </div>
            )}

            {actionMode === 'QUALITY' && (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="text-sm text-gray-600">质检来源
                  <select value={qualityForm.sourceBucket} disabled className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900">
                    <option value="QC_PENDING">待质检</option>
                    <option value="REWORK_PENDING">返工复检</option>
                  </select>
                </label>
                {[
                  ['inputQty', '质检数量'],
                  ['sampleQty', '抽检数量'],
                  ['passedQty', '合格数量'],
                  ['reworkQty', '返工数量'],
                  ['scrapQty', '报废数量'],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm text-gray-600">{label}
                    <input type="number" min={0} step={1} value={qualityForm[field as keyof typeof qualityForm] as number} onChange={(event) => setQualityForm({ ...qualityForm, [field]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900" />
                  </label>
                ))}
                <label className="text-sm text-gray-600">不合格说明
                  <input value={qualityForm.badReason} onChange={(event) => setQualityForm({ ...qualityForm, badReason: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
                <label className="text-sm text-gray-600">备注
                  <input value={qualityForm.note} onChange={(event) => setQualityForm({ ...qualityForm, note: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
              </div>
            )}

            {actionMode === 'STOCK_IN' && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm text-gray-600">入库数量
                  <input type="number" min={1} step={1} value={stockInForm.qty} onChange={(event) => setStockInForm({ ...stockInForm, qty: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-gray-900" />
                </label>
                <label className="text-sm text-gray-600">成品批次号
                  <input value={stockInForm.batchNo} onChange={(event) => setStockInForm({ ...stockInForm, batchNo: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
                <label className="text-sm text-gray-600">备注
                  <input value={stockInForm.note} onChange={(event) => setStockInForm({ ...stockInForm, note: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-gray-900" />
                </label>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeAction} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700">取消</button>
              <button disabled={loading} onClick={submitAction} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">确认提交</button>
            </div>
          </section>
        )}

        {totalActiveQty === 0 && lots.length > 0 && (
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">当前没有待处理数量。</div>
        )}
      </div>
    </>
  )
}
