'use client'

import { useState, useEffect } from 'react'

interface ProductionStat {
  productId: string
  productName: string
  productSku: string
  planQty: number
  completeQty: number
  scrapQty: number
  orderCount: number
}

interface QualityByOrder {
  orderId: string
  orderNo: string
  product: { id: string; name: string; sku: string } | null
  goodQty: number
  badQty: number
  reportCount: number
  passRate: number
  badRate: number
}

interface QualityData {
  totalGood: number
  totalBad: number
  passRate: number
  badRate: number
  byOrder: QualityByOrder[]
}

interface CostByType {
  costType: string
  totalAmount: number
  count: number
}

interface CostData {
  totalCost: number
  byType: CostByType[]
  byCategory: { category: string; totalAmount: number }[]
}

interface DashboardData {
  todayOrderCount: number
  monthOrderCount: number
  statusDistribution: { status: string; count: number }[]
  todayProduction: number
  monthProduction: number
  pendingMaterialInCount: number
  pendingShipmentCount: number
  pendingReturnCount: number
  lowStocks: any[]
}

type StatsTab = 'production' | 'quality' | 'cost' | 'dashboard'

const costTypeLabels: Record<string, string> = {
  MATERIAL: '材料成本',
  LABOR: '人工成本',
  EQUIPMENT: '设备成本',
  OVERHEAD: '制造费用',
  OTHER: '其他成本',
}

const orderStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PICKED: '已领料',
  RUNNING: '生产中',
  QC_WAITING: '待质检',
  QC_DONE: '质检完成',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

const orderStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PICKED: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-orange-100 text-orange-700',
  QC_WAITING: 'bg-purple-100 text-purple-700',
  QC_DONE: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

export default function StatsPage({ onMessage }: { onMessage: (msg: string) => void }) {
  const [tab, setTab] = useState<StatsTab>('dashboard')
  const [production, setProduction] = useState<ProductionStat[]>([])
  const [quality, setQuality] = useState<QualityData | null>(null)
  const [cost, setCost] = useState<CostData | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tab === 'production') fetchProduction()
    else if (tab === 'quality') fetchQuality()
    else if (tab === 'cost') fetchCost()
    else if (tab === 'dashboard') fetchDashboard()
  }, [tab])

  const fetchProduction = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats/production')
      const data = await res.json()
      setProduction(data.data || [])
    } catch (err) {
      onMessage('获取产量统计失败')
    }
    setLoading(false)
  }

  const fetchQuality = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats/quality')
      const data = await res.json()
      setQuality(data.data || null)
    } catch (err) {
      onMessage('获取质量统计失败')
    }
    setLoading(false)
  }

  const fetchCost = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/costs/stats')
      const data = await res.json()
      setCost(data.data || null)
    } catch (err) {
      onMessage('获取成本统计失败')
    }
    setLoading(false)
  }

  const fetchDashboard = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats/dashboard')
      const data = await res.json()
      setDashboard(data.data || null)
    } catch (err) {
      onMessage('获取仪表盘数据失败')
    }
    setLoading(false)
  }

  const tabs: { key: StatsTab; label: string }[] = [
    { key: 'dashboard', label: '仪表盘' },
    { key: 'production', label: '产量统计' },
    { key: 'quality', label: '质量统计' },
    { key: 'cost', label: '成本统计' },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-8 text-gray-500">加载中...</div>}

        {!loading && tab === 'dashboard' && dashboard && (
          <div>
            <h2 className="text-xl font-semibold mb-6">仪表盘</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <DashboardCard title="今日工单数" value={dashboard.todayOrderCount} icon="📋" color="blue" />
              <DashboardCard title="本月工单数" value={dashboard.monthOrderCount} icon="📅" color="indigo" />
              <DashboardCard title="今日产量" value={dashboard.todayProduction} icon="✅" color="green" />
              <DashboardCard title="本月产量" value={dashboard.monthProduction} icon="📊" color="emerald" />
              <DashboardCard title="待收货数" value={dashboard.pendingMaterialInCount} icon="📦" color="yellow" />
              <DashboardCard title="待发货数" value={dashboard.pendingShipmentCount} icon="🚚" color="orange" />
              <DashboardCard title="待退货数" value={dashboard.pendingReturnCount} icon="↩️" color="purple" />
              <DashboardCard title="库存预警数" value={dashboard.lowStocks.length} icon="⚠️" color="red" />
            </div>

            {dashboard.statusDistribution.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3">工单状态分布</h3>
                <div className="flex flex-wrap gap-2">
                  {dashboard.statusDistribution.map((s) => (
                    <div key={s.status} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${orderStatusColors[s.status] || 'bg-gray-100 text-gray-700'}`}>
                        {orderStatusLabels[s.status] || s.status}
                      </span>
                      <span className="font-semibold">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dashboard.lowStocks.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3">⚠️ 库存预警</h3>
                <div className="space-y-2">
                  {dashboard.lowStocks.map((stock) => (
                    <div key={stock.id} className="border border-red-200 bg-red-50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800">
                          {stock.material?.name || stock.product?.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {stock.material?.code || stock.product?.sku}
                        </div>
                      </div>
                      <div className="text-red-600 font-semibold">
                        可用：{stock.availableQty}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'production' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">产量统计</h2>
            {production.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品名称</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">SKU</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">计划产量</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">完成产量</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">报废产量</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工单数</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">完成率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {production.map((item) => (
                      <tr key={item.productId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{item.productName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.productSku}</td>
                        <td className="px-4 py-3">{item.planQty}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{item.completeQty}</td>
                        <td className="px-4 py-3 text-red-500">{item.scrapQty}</td>
                        <td className="px-4 py-3">{item.orderCount}</td>
                        <td className="px-4 py-3">
                          {item.planQty > 0 ? ((item.completeQty / item.planQty) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'quality' && quality && (
          <div>
            <h2 className="text-xl font-semibold mb-6">质量统计</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">总合格数</div>
                <div className="text-2xl font-semibold text-green-600">{quality.totalGood}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">总不良数</div>
                <div className="text-2xl font-semibold text-red-600">{quality.totalBad}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">合格率</div>
                <div className="text-2xl font-semibold text-green-600">{quality.passRate.toFixed(2)}%</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">不良率</div>
                <div className="text-2xl font-semibold text-red-600">{quality.badRate.toFixed(2)}%</div>
              </div>
            </div>

            <h3 className="font-semibold mb-3">按工单明细</h3>
            {quality.byOrder.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">工单号</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">产品</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">合格数</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">不良数</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">报工数</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">合格率</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">不良率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quality.byOrder.map((item) => (
                      <tr key={item.orderId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-blue-600">{item.orderNo}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.product?.name || '-'}</div>
                          <div className="text-xs text-gray-500">{item.product?.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-green-600">{item.goodQty}</td>
                        <td className="px-4 py-3 text-red-500">{item.badQty}</td>
                        <td className="px-4 py-3">{item.reportCount}</td>
                        <td className="px-4 py-3 text-green-600">{item.passRate.toFixed(2)}%</td>
                        <td className="px-4 py-3 text-red-500">{item.badRate.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'cost' && cost && (
          <div>
            <h2 className="text-xl font-semibold mb-6">成本统计</h2>
            <div className="border border-gray-200 rounded-lg p-4 mb-6">
              <div className="text-sm text-gray-500 mb-1">总成本</div>
              <div className="text-3xl font-semibold text-blue-600">¥{cost.totalCost.toFixed(2)}</div>
            </div>

            <h3 className="font-semibold mb-3">按成本类型分组</h3>
            {cost.byType.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">成本类型</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">记录数</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">总金额</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">占比</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cost.byType.map((item) => (
                      <tr key={item.costType} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            item.costType === 'MATERIAL' ? 'bg-blue-100 text-blue-700'
                            : item.costType === 'LABOR' ? 'bg-green-100 text-green-700'
                            : item.costType === 'EQUIPMENT' ? 'bg-orange-100 text-orange-700'
                            : item.costType === 'OVERHEAD' ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-700'
                          }`}>
                            {costTypeLabels[item.costType] || item.costType}
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.count}</td>
                        <td className="px-4 py-3 font-medium">¥{item.totalAmount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {cost.totalCost > 0 ? ((item.totalAmount / cost.totalCost) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DashboardCard({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50',
    indigo: 'border-indigo-200 bg-indigo-50',
    green: 'border-green-200 bg-green-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    orange: 'border-orange-200 bg-orange-50',
    purple: 'border-purple-200 bg-purple-50',
    red: 'border-red-200 bg-red-50',
  }
  return (
    <div className={`border rounded-lg p-4 ${colorMap[color] || 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-600">{title}</div>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
    </div>
  )
}
