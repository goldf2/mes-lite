'use client'

import { useCallback, useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import DataIntegrityPanel from '@/app/components/DataIntegrityPanel'
import ImageOptimizationPanel from '@/app/components/ImageOptimizationPanel'
import {
  executeMaterialCodeNormalization,
  loadMaterialCodeNormalizationPreview,
  OperationsToolsRequestError,
} from '../client/maintenance-api'
import type { MaterialCodeNormalizationPreview } from '../contracts/maintenance'

export default function DataToolsPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [preview, setPreview] = useState<MaterialCodeNormalizationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    try {
      setPreview(await loadMaterialCodeNormalizationPreview() || null)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '检查物料编码失败')
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const execute = async () => {
    if (!preview || !preview.canExecute || preview.pendingMaterialCount === 0) return
    if (!window.confirm(`将删除 ${preview.pendingMaterialCount} 条物料编码中的全部空白字符并转换为大写。该操作会同步关联产品编码，是否继续？`)) return

    setExecuting(true)
    try {
      const result = await executeMaterialCodeNormalization()
      if (!result) throw new Error('物料编码转换未返回结果')
      onMessage(`已转换 ${result.changedMaterials} 条物料编码，同步 ${result.changedProducts} 条关联产品编码`)
      await loadPreview()
    } catch (error) {
      if (error instanceof OperationsToolsRequestError && error.data) {
        setPreview(error.data as MaterialCodeNormalizationPreview)
      }
      onMessage(error instanceof Error ? error.message : '物料编码转换失败')
    } finally {
      setExecuting(false)
    }
  }

  const blockerCount = preview
    ? preview.invalidMaterials.length + preview.materialConflicts.length + preview.productConflicts.length + preview.ambiguousProducts.length
    : 0

  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold">数据工具</h3>
        <p className="mt-1 text-sm text-gray-500">执行前先预检，修改与删除操作使用数据库事务并写入操作记录。</p>
      </div>

      <div className="mb-4">
        <ImageOptimizationPanel onMessage={onMessage} />
      </div>
      <DataIntegrityPanel onMessage={onMessage} />

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-medium text-gray-900">规范化物料编码</div>
            <div className="mt-1 text-sm text-gray-500">删除编码中的全部空格、制表符和换行，再将英文字母转换为大写。</div>
            <div className="mt-2 text-xs text-gray-500">物料关联的兼容产品编码会同步更新；名称、规格、历史单据快照不变。</div>
          </div>
          <AppButton
            variant="primary"
            onClick={execute}
            disabled={loading || executing || !preview?.canExecute || preview.pendingMaterialCount === 0}
          >
            {executing ? '转换中...' : '转换为大写并删除空格'}
          </AppButton>
        </div>

        {loading ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">正在检查物料编码...</div>
        ) : preview ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">物料总数</div><div className="mt-1 text-xl font-semibold">{preview.totalMaterials}</div></div>
              <div className="rounded-lg bg-blue-50 p-3"><div className="text-xs text-blue-600">待转换物料</div><div className="mt-1 text-xl font-semibold text-blue-800">{preview.pendingMaterialCount}</div></div>
              <div className="rounded-lg bg-cyan-50 p-3"><div className="text-xs text-cyan-600">关联产品同步</div><div className="mt-1 text-xl font-semibold text-cyan-800">{preview.pendingProductCount}</div></div>
              <div className={`rounded-lg p-3 ${blockerCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}><div className={`text-xs ${blockerCount > 0 ? 'text-red-600' : 'text-green-600'}`}>阻塞问题</div><div className={`mt-1 text-xl font-semibold ${blockerCount > 0 ? 'text-red-800' : 'text-green-800'}`}>{blockerCount}</div></div>
            </div>

            {blockerCount > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="font-medium">存在冲突，当前禁止转换</div>
                {preview.invalidMaterials.map((item) => <div key={item.id} className="mt-2">空白编码：{item.name}（{JSON.stringify(item.code)}）</div>)}
                {preview.materialConflicts.map((item) => (
                  <div key={item.normalizedCode} className="mt-2">
                    转换后重复为 {item.normalizedCode}：{item.materials.map((material) => `${material.code} · ${material.name}`).join('；')}
                  </div>
                ))}
                {preview.productConflicts.map((item) => <div key={item.normalizedSku} className="mt-2">关联产品编码冲突：{item.normalizedSku}</div>)}
                {preview.ambiguousProducts.map((item) => <div key={item.productId} className="mt-2">关联产品 {item.sku} 同时匹配物料：{item.materialCodes.join('、')}</div>)}
              </div>
            )}

            {blockerCount === 0 && preview.pendingMaterialCount === 0 && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">当前全部物料编码已经符合规范，无需转换。</div>
            )}

            {preview.pendingMaterialCount > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-gray-700">转换预览（最多显示 20 条）</div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2">物料</th><th className="px-3 py-2">转换前</th><th className="px-3 py-2">转换后</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.changes.slice(0, 20).map((change) => (
                        <tr key={change.id}><td className="px-3 py-2">{change.name}{change.archived ? '（已归档）' : ''}</td><td className="px-3 py-2 font-mono text-gray-600">{change.before}</td><td className="px-3 py-2 font-mono font-medium text-blue-700">{change.after}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
