import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'
import { BomDraftEditor, type BomDraftController, type BomSearchRow } from '@/modules/bom'

export default function MaterialBomWorkspace({
  rows,
  loading,
  keyword,
  selectedMaterialId,
  selectedBomId,
  controller,
  onSelectBom,
}: {
  rows: BomSearchRow[]
  loading: boolean
  keyword: string
  selectedMaterialId: string
  selectedBomId: string
  controller: BomDraftController
  onSelectBom: (materialId: string, bomId: string) => void
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <aside aria-label="已有 BOM 列表" className="min-w-0 rounded-lg bg-white p-3 shadow xl:sticky xl:top-0 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain">
        <div className="mb-3 flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">BOM 列表</h3>
            <p className="mt-0.5 text-xs text-gray-500">选择 BOM 后在右侧修改；可按产品或投入物料搜索</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{rows.length}</span>
        </div>

        {loading ? (
          <AppLoadingIndicator compact label="正在加载 BOM..." className="rounded-lg border border-dashed border-gray-200" />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
            {keyword.trim() ? '没有匹配的已有 BOM' : '暂无已有 BOM，可点击“新建 BOM”创建'}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ product, bom, materialId, material }) => {
              const primaryOutput = bom.outputs.find((output) => output.isPrimary)?.material || material
              const inputs = bom.items.filter((item) => item.itemType === 'MATERIAL' && item.material).map((item) => item.material!)
              const inputSummary = inputs.length > 0
                ? `${inputs.slice(0, 2).map((item) => `${item.code} ${item.name}`).join('、')}${inputs.length > 2 ? ` 等 ${inputs.length} 项` : ''}`
                : '暂无投入物料'
              const selected = selectedMaterialId === materialId && selectedBomId === bom.id
              return (
                <button key={bom.id} type="button" onClick={() => onSelectBom(materialId, bom.id)} className={`w-full rounded-lg border p-3 text-left transition ${selected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0"><span className="block text-[11px] font-medium text-blue-600">BOM · {bom.version}</span><span className="mt-0.5 block truncate text-sm font-semibold text-gray-900">{bom.name}</span></span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${bom.purpose === 'PACKAGING' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{bom.purpose === 'PACKAGING' ? '包装' : '生产'}</span>
                      {bom.isDefault && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">默认</span>}
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${bom.status === 'RELEASED' ? 'bg-emerald-50 text-emerald-700' : bom.status === 'DRAFT' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                        {bom.status === 'RELEASED' ? '已发布' : bom.status === 'DRAFT' ? '草稿' : '已作废'}
                      </span>
                    </span>
                  </span>
                  <span className="my-2 block border-t border-gray-100" />
                  <span className="block truncate text-xs text-gray-600">主产出：{primaryOutput?.code || product.sku} · {primaryOutput?.name || product.name}</span>
                  <span className="mt-1 block truncate text-xs text-gray-500" title={inputSummary}>投入：{inputSummary}</span>
                  <span className="mt-2 block text-[11px] text-gray-400">投入 {bom.items.length} 项 · 产出 {bom.outputs.length} 项</span>
                </button>
              )
            })}
          </div>
        )}
      </aside>

      <div aria-label="BOM 创建与修改工作区" className="min-w-0 rounded-lg bg-white p-4 shadow sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-gray-900">BOM 版本</h3>{loading && <span className="text-xs text-gray-500">同步中...</span>}</div>
            <div className="mt-1 truncate text-sm text-gray-500">{controller.selectedMaterial ? `${controller.selectedMaterial.code} · ${controller.selectedMaterial.name}` : '新建 BOM：分别添加每批投入和产出'}</div>
            {controller.selectedBom && controller.selectedBom.status !== 'DRAFT' && (
              <p className="mt-1 text-xs text-gray-500">已发布和已作废版本只读；需要调整时请创建新版本。</p>
            )}
          </div>
        </div>
        <BomDraftEditor controller={controller} showSaveAction />
      </div>
    </div>
  )
}
