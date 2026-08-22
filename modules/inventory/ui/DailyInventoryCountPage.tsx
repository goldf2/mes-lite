'use client'

import { useEffect, useMemo, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import SearchableSelect from '@/app/components/SearchableSelect'
import { loadInventoryLocations, loadStocks, submitDailyInventoryCount } from '../client/stock-api'
import type { InventoryLocationOption, Stock } from '../contracts/stock'
import { materialCategoryFilterOptions, stockDisplayCode, stockDisplayName, stockQuantityText, stockUnit } from '../model/stock-view'

type CountLine = { stockId: string; countedQty: number }

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function locationQty(stock: Stock, locationId: string) {
  return Number(stock.locationBalances.find((balance) => balance.locationId === locationId)?.qty || 0)
}

export default function DailyInventoryCountPage({ canUpdate, onMessage }: { canUpdate: boolean; onMessage: (message: string) => void }) {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [locations, setLocations] = useState<InventoryLocationOption[]>([])
  const [locationId, setLocationId] = useState('')
  const [countDate, setCountDate] = useState(todayInShanghai)
  const [reason, setReason] = useState('每日生产结束账实核对')
  const [lines, setLines] = useState<CountLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [stockResult, locationResult] = await Promise.all([
        loadStocks({
          keyword: '', customerId: '', locationId: '', includeInvalid: false,
          categories: materialCategoryFilterOptions.map((item) => item.value),
          allCategories: materialCategoryFilterOptions,
        }),
        loadInventoryLocations(),
      ])
      if (!stockResult.ok) throw new Error(stockResult.error)
      const materialStocks = stockResult.data.filter((stock) => stock.material)
      setStocks(materialStocks)
      setLocations(locationResult)
      setLocationId((current) => current || locationResult.find((item) => item.isDefault)?.id || locationResult[0]?.id || '')
      return materialStocks
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '读取库存失败')
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // 仅在首次进入页面时读取候选；保存成功后由提交动作显式刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stockById = useMemo(() => new Map(stocks.map((stock) => [stock.id, stock])), [stocks])
  const selectedIds = new Set(lines.map((line) => line.stockId))
  const options = stocks
    .filter((stock) => !selectedIds.has(stock.id))
    .map((stock) => ({
      value: stock.id,
      label: `${stockDisplayCode(stock)} · ${stockDisplayName(stock)}${stock.material?.spec ? ` · ${stock.material.spec}` : ''}`,
    }))
  const changedCount = lines.filter((line) => {
    const stock = stockById.get(line.stockId)
    return stock && Math.abs(line.countedQty - locationQty(stock, locationId)) > 0.000001
  }).length

  function addStock(stockId: string) {
    const stock = stockById.get(stockId)
    if (!stock || lines.some((line) => line.stockId === stockId)) return
    setLines((current) => [...current, { stockId, countedQty: locationQty(stock, locationId) }])
  }

  function addOccupiedStocks() {
    if (!locationId) return onMessage('请先选择盘点库位')
    const occupied = stocks.filter((stock) => locationQty(stock, locationId) > 0.000001)
    setLines((current) => {
      const currentIds = new Set(current.map((line) => line.stockId))
      return [...current, ...occupied.filter((stock) => !currentIds.has(stock.id)).map((stock) => ({ stockId: stock.id, countedQty: locationQty(stock, locationId) }))]
    })
  }

  function changeLocation(nextLocationId: string) {
    setLocationId(nextLocationId)
    setLines((current) => current.map((line) => ({
      stockId: line.stockId,
      countedQty: locationQty(stockById.get(line.stockId)!, nextLocationId),
    })))
  }

  async function submit() {
    if (!canUpdate) return onMessage('当前账号没有库存调整权限')
    if (!locationId) return onMessage('请选择盘点库位')
    if (lines.length === 0) return onMessage('请至少加入一条盘点物品')
    if (reason.trim().length < 2) return onMessage('请填写差异原因')
    setSaving(true)
    try {
      const result = await submitDailyInventoryCount({ countDate, locationId, reason: reason.trim(), items: lines })
      onMessage(result.message)
      if (!result.ok) return
      const refreshed = await loadData()
      const refreshedById = new Map(refreshed.map((stock) => [stock.id, stock]))
      setLines((current) => current.map((line) => ({
        stockId: line.stockId,
        countedQty: locationQty(refreshedById.get(line.stockId) || stockById.get(line.stockId)!, locationId),
      })))
    } catch {
      onMessage('生产日报盘点失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading && stocks.length === 0) return <AppLoadingIndicator label="正在读取生产日报库存..." />

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
        <h2 className="text-base font-semibold">生产日报（每日盘点）</h2>
        <p className="mt-1 leading-6">直接录入库位实盘数，系统按差异更新可用库存并写入库存流水和操作记录；不要求生产人员、设备、工序或质量作业，也不会生成生产实绩或质检记录。</p>
        <p className="mt-1 text-amber-800">FIFO 物料以及含待检、冻结、返工库存的物料仍受保护，必须走对应业务流程。</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[12rem_minmax(16rem,1fr)_minmax(18rem,1.2fr)]">
          <label className="text-sm font-medium text-gray-700">盘点日期
            <input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" />
          </label>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">盘点库位</label>
            <SearchableSelect value={locationId} onChange={changeLocation} options={locations.map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))} placeholder="输入库位编码或名称" />
          </div>
          <label className="text-sm font-medium text-gray-700">差异原因
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="例如：每日生产结束账实核对" />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-2 block text-sm font-medium text-gray-700">添加盘点物品</label>
            <SearchableSelect value="" onChange={addStock} options={options} placeholder="输入物料编码、名称或规格" />
          </div>
          <AppButton variant="secondary" onClick={addOccupiedStocks} disabled={!locationId}>加入该库位全部有账面库存物品</AppButton>
          <AppButton variant="secondary" onClick={() => setLines([])} disabled={lines.length === 0}>清空</AppButton>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div><h3 className="font-semibold text-gray-900">本次盘点明细</h3><p className="mt-0.5 text-xs text-gray-500">{lines.length} 项 · {changedCount} 项存在差异</p></div>
          <AppButton variant="primary" onClick={() => void submit()} disabled={saving || lines.length === 0 || !canUpdate}>{saving ? '正在过账...' : `确认整单（${lines.length} 项）`}</AppButton>
        </div>
        {lines.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">先选择物品，实盘数量默认带出当前账面数，只需修改有差异的行。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-4 py-3">物品</th><th className="px-4 py-3">账面数</th><th className="px-4 py-3">实盘数</th><th className="px-4 py-3">差异</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line) => {
                  const stock = stockById.get(line.stockId)
                  if (!stock) return null
                  const bookQty = locationQty(stock, locationId)
                  const difference = Number((line.countedQty - bookQty).toFixed(6))
                  return (
                    <tr key={line.stockId}>
                      <td className="px-4 py-3"><div className="font-medium text-gray-900">{stockDisplayCode(stock)} · {stockDisplayName(stock)}</div><div className="mt-0.5 text-xs text-gray-500">{stock.material?.spec || '无规格'} · {stockUnit(stock)}</div></td>
                      <td className="px-4 py-3 tabular-nums">{stockQuantityText(bookQty)} {stockUnit(stock)}</td>
                      <td className="px-4 py-3"><input type="number" min={0} step="0.0001" value={line.countedQty} onChange={(event) => setLines((current) => current.map((item) => item.stockId === line.stockId ? { ...item, countedQty: Number(event.target.value) } : item))} className="w-40 rounded-lg border border-gray-200 px-3 py-2 tabular-nums" /></td>
                      <td className={`px-4 py-3 font-medium tabular-nums ${difference > 0 ? 'text-emerald-700' : difference < 0 ? 'text-red-700' : 'text-gray-500'}`}>{difference > 0 ? '+' : ''}{stockQuantityText(difference)} {stockUnit(stock)}</td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => setLines((current) => current.filter((item) => item.stockId !== line.stockId))} className="text-red-600 hover:text-red-700">移除</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
