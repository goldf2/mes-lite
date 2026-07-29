'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, History, Scissors, Settings2 } from 'lucide-react'
import TopBarPortal from './TopBarPortal'
import ResponsiveToolbarActions from './ResponsiveToolbarActions'

interface ProfileSpec {
  id: string
  materialId: string
  sectionDescription?: string | null
  alloyGrade?: string | null
  temper?: string | null
  surfaceTreatment?: string | null
  drawingNo?: string | null
  densityKgPerMeter?: number | null
  trackingMode: 'BATCH' | 'SINGLE'
}

interface MaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  stockUnit: string
  valuationUnit: string
  profileSpec?: ProfileSpec | null
}

interface ProfileEntity {
  id: string
  entityNo: string
  entityType: string
  actualLengthMm: number
  originalLengthMm: number
  quantity: number
  availableQty: number
  reservedQty: number
  consumedQty: number
  scrappedQty: number
  splitQty: number
  totalWeightKg?: number | null
  unitWeightKg?: number | null
  availableWeightKg: number
  batchNo?: string | null
  location?: string | null
  status: string
  isRemnant: boolean
  reusable: boolean
  sourceType: string
  receivedAt?: string | null
  material: {
    id: string
    code: string
    name: string
    spec?: string | null
    stockUnit: string
    valuationUnit: string
    profileSpec?: ProfileSpec | null
    stock?: { qty: number; availableQty: number } | null
  }
  materialIn?: { id: string; inboundNo: string } | null
  supplier?: { id: string; code: string; name: string } | null
  parentEntity?: { id: string; entityNo: string } | null
  _count: { movements: number; childEntities: number }
}

interface ProfileMovement {
  id: string
  movementType: string
  quantityDelta: number
  beforeAvailableQty: number
  afterAvailableQty: number
  beforeStatus?: string | null
  afterStatus?: string | null
  sourceType: string
  sourceId: string
  operatorName?: string | null
  note?: string | null
  createdAt: string
}

const statusOptions = [
  ['AVAILABLE', '可用'],
  ['RESERVED', '占用'],
  ['REMNANT', '余料'],
  ['CONSUMED', '已耗用'],
  ['SCRAPPED', '报废'],
  ['SPLIT', '已拆分'],
  ['REVERSED', '已红冲'],
] as const

const statusLabels = Object.fromEntries(statusOptions)
const statusClasses: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  RESERVED: 'bg-amber-100 text-amber-700',
  REMNANT: 'bg-blue-100 text-blue-700',
  CONSUMED: 'bg-gray-100 text-gray-600',
  SCRAPPED: 'bg-red-100 text-red-700',
  SPLIT: 'bg-violet-100 text-violet-700',
  REVERSED: 'bg-orange-100 text-orange-700',
}

function emptySpecForm() {
  return {
    materialId: '',
    sectionDescription: '',
    alloyGrade: '',
    temper: '',
    surfaceTreatment: '',
    drawingNo: '',
    densityKgPerMeter: 0,
    trackingMode: 'BATCH' as 'BATCH' | 'SINGLE',
  }
}

export default function ProfileStockPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [entities, setEntities] = useState<ProfileEntity[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [status, setStatus] = useState('AVAILABLE')
  const [minLength, setMinLength] = useState('')
  const [maxLength, setMaxLength] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({ availableQty: 0, availableWeightKg: 0 })
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 0 })
  const [showSpecModal, setShowSpecModal] = useState(false)
  const [specForm, setSpecForm] = useState(emptySpecForm)
  const [movementEntity, setMovementEntity] = useState<ProfileEntity | null>(null)
  const [movements, setMovements] = useState<ProfileMovement[]>([])
  const [splitTarget, setSplitTarget] = useState<ProfileEntity | null>(null)
  const [splitQuantity, setSplitQuantity] = useState(1)

  const fetchMaterials = useCallback(async () => {
    try {
      const response = await fetch('/api/materials?pageSize=200&categories=RAW')
      const payload = await response.json()
      if (response.ok) setMaterials(payload.data || [])
      else onMessage(payload.error || '获取物料失败')
    } catch {
      onMessage('获取物料失败')
    }
  }, [onMessage])

  const fetchEntities = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pagination.pageSize) })
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (materialId) params.set('materialId', materialId)
      if (status) params.set('statuses', status)
      if (minLength) params.set('minLength', minLength)
      if (maxLength) params.set('maxLength', maxLength)
      const response = await fetch(`/api/profile-stock?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) {
        onMessage(payload.error || '获取型材实体库存失败')
        return
      }
      setEntities(payload.data || [])
      setSummary(payload.summary || { availableQty: 0, availableWeightKg: 0 })
      setPagination(payload.pagination)
    } catch {
      onMessage('获取型材实体库存失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, materialId, status, minLength, maxLength, pagination.pageSize, onMessage])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  useEffect(() => {
    const timer = window.setTimeout(() => fetchEntities(1), 180)
    return () => window.clearTimeout(timer)
  }, [fetchEntities])

  const trackedMaterialCount = useMemo(
    () => materials.filter((material) => Boolean(material.profileSpec)).length,
    [materials],
  )

  const openSpecModal = (material?: MaterialOption) => {
    const target = material || materials.find((item) => item.id === materialId)
    const spec = target?.profileSpec
    setSpecForm({
      materialId: target?.id || '',
      sectionDescription: spec?.sectionDescription || '',
      alloyGrade: spec?.alloyGrade || '',
      temper: spec?.temper || '',
      surfaceTreatment: spec?.surfaceTreatment || '',
      drawingNo: spec?.drawingNo || '',
      densityKgPerMeter: Number(spec?.densityKgPerMeter || 0),
      trackingMode: spec?.trackingMode || 'BATCH',
    })
    setShowSpecModal(true)
  }

  const saveSpec = async () => {
    if (!specForm.materialId) {
      onMessage('请选择物料')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/profile-specs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...specForm,
          densityKgPerMeter: specForm.densityKgPerMeter > 0 ? specForm.densityKgPerMeter : null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        onMessage(payload.error || '保存型材规格失败')
        return
      }
      setShowSpecModal(false)
      onMessage(payload.message || '型材规格已保存')
      await fetchMaterials()
      await fetchEntities(1)
    } finally {
      setLoading(false)
    }
  }

  const splitEntity = async () => {
    if (!splitTarget) return
    const quantity = Number(splitQuantity)
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > splitTarget.availableQty) {
      onMessage('请输入不超过可用数量的正整数')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/profile-stock/${splitTarget.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, clientRequestId: window.crypto.randomUUID() }),
      })
      const payload = await response.json()
      onMessage(response.ok ? payload.message : payload.error || '拆分失败')
      if (response.ok) {
        setSplitTarget(null)
        await fetchEntities()
      }
    } finally {
      setLoading(false)
    }
  }

  const showMovements = async (entity: ProfileEntity) => {
    setMovementEntity(entity)
    setMovements([])
    const response = await fetch(`/api/profile-stock/${entity.id}/movements`)
    const payload = await response.json()
    if (!response.ok) {
      onMessage(payload.error || '获取实体流水失败')
      return
    }
    setMovements(payload.data || [])
  }

  return (
    <>
      <TopBarPortal>
        <ResponsiveToolbarActions
          primaryFilters={(
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索实体编号、物料、批次、库位或来料单"
              className="w-full min-w-[220px] max-w-[380px] rounded-lg border border-gray-200 px-4 py-2 text-sm"
            />
          )}
          filters={(
            <>
              <select value={materialId} onChange={(event) => setMaterialId(event.target.value)} className="w-52 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">全部型材规格</option>
                {materials.filter((item) => item.profileSpec).map((material) => (
                  <option key={material.id} value={material.id}>{material.code} · {material.name}</option>
                ))}
              </select>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">全部状态</option>
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input value={minLength} onChange={(event) => setMinLength(event.target.value)} type="number" min={0} placeholder="最短 mm" className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <input value={maxLength} onChange={(event) => setMaxLength(event.target.value)} type="number" min={0} placeholder="最长 mm" className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </>
          )}
          actions={(
            <button onClick={() => openSpecModal()} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Settings2 className="h-4 w-4" />
              型材规格
            </button>
          )}
        />
      </TopBarPortal>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500"><Boxes className="h-4 w-4" />筛选结果可用根数</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.availableQty}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">筛选结果实体重量</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.availableWeightKg.toFixed(3)} kg</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">已启用实体追踪的规格</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{trackedMaterialCount}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-4 py-3">实体编号</th>
                <th className="px-4 py-3">物料规格</th>
                <th className="px-4 py-3">实际长度</th>
                <th className="px-4 py-3">数量状态</th>
                <th className="px-4 py-3">类型/状态</th>
                <th className="px-4 py-3">重量</th>
                <th className="px-4 py-3">批次/库位</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entities.map((entity) => (
                <tr key={entity.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-medium text-blue-700">{entity.entityNo}</div>
                    {entity.parentEntity && <div className="mt-1 text-xs text-gray-500">父实体：{entity.parentEntity.entityNo}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{entity.material.code}</div>
                    <div className="text-xs text-gray-500">{entity.material.name}{entity.material.spec ? ` · ${entity.material.spec}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-base font-semibold text-gray-900">{entity.actualLengthMm} mm</td>
                  <td className="px-4 py-3">
                    <div>可用 {entity.availableQty} / 总数 {entity.quantity}</div>
                    {(entity.reservedQty > 0 || entity.consumedQty > 0 || entity.scrappedQty > 0 || entity.splitQty > 0) && (
                      <div className="mt-1 text-xs text-gray-500">
                        占用 {entity.reservedQty} · 耗用 {entity.consumedQty} · 报废 {entity.scrappedQty} · 已拆 {entity.splitQty}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{entity.entityType === 'SINGLE' ? '单根' : entity.entityType === 'REMNANT' ? '余料' : '同长批次'}</div>
                    <span className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs ${statusClasses[entity.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[entity.status] || entity.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>{entity.availableWeightKg > 0 ? `${entity.availableWeightKg.toFixed(3)} kg 可用` : '-'}</div>
                    {entity.unitWeightKg != null && <div className="text-xs text-gray-500">{entity.unitWeightKg.toFixed(3)} kg/根</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div>{entity.batchNo || '-'}</div>
                    <div className="text-xs text-gray-500">{entity.location || '未指定库位'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{entity.materialIn?.inboundNo || entity.sourceType}</div>
                    <div className="text-xs text-gray-500">{entity.supplier?.name || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {entity.entityType === 'BATCH' && entity.status === 'AVAILABLE' && entity.availableQty > 0 && (
                        <button
                          disabled={loading}
                          onClick={() => {
                            setSplitTarget(entity)
                            setSplitQuantity(entity.availableQty)
                          }}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                        >
                          <Scissors className="h-3.5 w-3.5" />拆单根
                        </button>
                      )}
                      <button onClick={() => showMovements(entity)} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                        <History className="h-3.5 w-3.5" />流水
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && entities.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-500">暂无符合条件的型材实体；先维护型材规格，再在来料单录入实测长度并确认收货。</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          <span>共 {pagination.total} 条，第 {pagination.page}/{Math.max(1, pagination.totalPages)} 页</span>
          <div className="flex gap-2">
            <button disabled={pagination.page <= 1 || loading} onClick={() => fetchEntities(pagination.page - 1)} className="rounded border border-gray-200 px-3 py-1.5 disabled:opacity-40">上一页</button>
            <button disabled={pagination.page >= pagination.totalPages || loading} onClick={() => fetchEntities(pagination.page + 1)} className="rounded border border-gray-200 px-3 py-1.5 disabled:opacity-40">下一页</button>
          </div>
        </div>
      </div>

      {showSpecModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">维护型材规格</h3>
              <button onClick={() => setShowSpecModal(false)} className="text-2xl text-gray-400">×</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-gray-700 sm:col-span-2">
                物料
                <select
                  value={specForm.materialId}
                  onChange={(event) => {
                    const material = materials.find((item) => item.id === event.target.value)
                    const spec = material?.profileSpec
                    setSpecForm({
                      materialId: event.target.value,
                      sectionDescription: spec?.sectionDescription || '',
                      alloyGrade: spec?.alloyGrade || '',
                      temper: spec?.temper || '',
                      surfaceTreatment: spec?.surfaceTreatment || '',
                      drawingNo: spec?.drawingNo || '',
                      densityKgPerMeter: Number(spec?.densityKgPerMeter || 0),
                      trackingMode: spec?.trackingMode || 'BATCH',
                    })
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="">请选择原材料物料</option>
                  {materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}
                </select>
              </label>
              {[
                ['sectionDescription', '截面描述'],
                ['alloyGrade', '合金牌号'],
                ['temper', '材料状态'],
                ['surfaceTreatment', '表面处理'],
                ['drawingNo', '图号'],
              ].map(([key, label]) => (
                <label key={key} className="text-sm text-gray-700">
                  {label}
                  <input
                    value={(specForm as any)[key]}
                    onChange={(event) => setSpecForm({ ...specForm, [key]: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                  />
                </label>
              ))}
              <label className="text-sm text-gray-700">
                理论米重 kg/m（可选）
                <input type="number" min={0} step="0.001" value={specForm.densityKgPerMeter || ''} onChange={(event) => setSpecForm({ ...specForm, densityKgPerMeter: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="text-sm text-gray-700">
                默认追溯粒度
                <select value={specForm.trackingMode} onChange={(event) => setSpecForm({ ...specForm, trackingMode: event.target.value as 'BATCH' | 'SINGLE' })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                  <option value="BATCH">同长批次</option>
                  <option value="SINGLE">逐根实体</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowSpecModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
              <button disabled={loading} onClick={saveSpec} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}

      {splitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">拆分为单根实体</h3>
              <button onClick={() => setSplitTarget(null)} className="text-2xl text-gray-400">×</button>
            </div>
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
              <div className="font-mono">{splitTarget.entityNo}</div>
              <div className="mt-1">{splitTarget.actualLengthMm} mm · 当前可用 {splitTarget.availableQty} 根</div>
            </div>
            <label className="mt-4 block text-sm text-gray-700">
              拆分根数
              <input
                type="number"
                min={1}
                max={splitTarget.availableQty}
                step={1}
                value={splitQuantity}
                onChange={(event) => setSplitQuantity(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <p className="mt-2 text-xs text-gray-500">系统会从同长批次转出相同数量，并为每根生成独立实体和审计流水。</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setSplitTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
              <button disabled={loading} onClick={splitEntity} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                确认拆分
              </button>
            </div>
          </div>
        </div>
      )}

      {movementEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">实体流水</h3>
                <div className="mt-1 font-mono text-sm text-blue-700">{movementEntity.entityNo}</div>
              </div>
              <button onClick={() => setMovementEntity(null)} className="text-2xl text-gray-400">×</button>
            </div>
            <div className="mt-5 space-y-3">
              {movements.map((movement) => (
                <div key={movement.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{movement.movementType} · {movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta} 根</div>
                    <div className="text-xs text-gray-500">{new Date(movement.createdAt).toLocaleString('zh-CN')}</div>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    可用 {movement.beforeAvailableQty} → {movement.afterAvailableQty}；状态 {movement.beforeStatus || '-'} → {movement.afterStatus || '-'}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    来源：{movement.sourceType} / {movement.sourceId} · 操作人：{movement.operatorName || '-'}
                  </div>
                  {movement.note && <div className="mt-2 text-sm text-gray-700">{movement.note}</div>}
                </div>
              ))}
              {movements.length === 0 && <div className="py-10 text-center text-sm text-gray-500">暂无流水</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
