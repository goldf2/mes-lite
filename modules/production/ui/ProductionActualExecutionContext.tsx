'use client'

import { OneToManyRelationField, RelationSearch } from '@/app/components/relations'
import { appTextareaClassName } from '@/app/components/FormField'

export type ProductionActualEquipmentOption = {
  id: string
  code: string
  name: string
  equipmentType: string
  model?: string | null
  status: string
  workCenter: { id: string; code: string; name: string }
}

export type ProductionActualWorkInstructionOption = {
  id: string
  title: string
  version: string
  status: string
  updatedAt: string
  category: { id: string; name: string }
  material?: { id: string; code: string; name: string } | null
  workCenters: Array<{ id: string; code: string; name: string }>
  attachments: Array<{ id: string; originalName: string; mimeType: string; size: number }>
}

export type ProductionActualEquipmentSnapshot = {
  id: string
  equipmentCode: string
  equipmentName: string
  equipmentType: string
  equipmentModel?: string | null
  equipmentStatus: string
  workCenterCode: string
  workCenterName: string
}

export type ProductionActualWorkInstructionSnapshot = {
  id: string
  title: string
  version: string
  categoryName: string
  materialCode?: string | null
  materialName?: string | null
  workCentersJson: string
  attachmentsJson: string
  sourceUpdatedAt: string
}

function dateText(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString('zh-CN')
}

function attachmentNames(value: string) {
  try {
    const items = JSON.parse(value) as Array<{ originalName?: string }>
    return items.map((item) => item.originalName).filter((name): name is string => Boolean(name))
  } catch {
    return []
  }
}

export function ProductionActualExecutionContextPicker({
  equipmentOptions,
  workInstructionOptions,
  equipmentIds,
  workInstructionIds,
  equipmentExceptionReason,
  workInstructionExceptionReason,
  onEquipmentIdsChange,
  onWorkInstructionIdsChange,
  onEquipmentExceptionReasonChange,
  onWorkInstructionExceptionReasonChange,
}: {
  equipmentOptions: ProductionActualEquipmentOption[]
  workInstructionOptions: ProductionActualWorkInstructionOption[]
  equipmentIds: string[]
  workInstructionIds: string[]
  equipmentExceptionReason: string
  workInstructionExceptionReason: string
  onEquipmentIdsChange: (ids: string[]) => void
  onWorkInstructionIdsChange: (ids: string[]) => void
  onEquipmentExceptionReasonChange: (reason: string) => void
  onWorkInstructionExceptionReasonChange: (reason: string) => void
}) {
  const selectedEquipment = equipmentOptions.filter((item) => equipmentIds.includes(item.id))
  const selectedInstructions = workInstructionOptions.filter((item) => workInstructionIds.includes(item.id))

  return (
    <section className="mt-5">
      <div>
        <h4 className="font-semibold text-gray-900">执行上下文</h4>
        <p className="mt-1 text-xs text-gray-500">按订单工作中心和产品筛选；保存时冻结设备状态、作业文件版本、正文和附件清单，来源资料后续修改不会覆盖实绩。</p>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <OneToManyRelationField
            title="实际设备"
            items={selectedEquipment}
            getKey={(item) => item.id}
            selector={<RelationSearch
              items={equipmentOptions}
              getKey={(item) => item.id}
              getLabel={(item) => `${item.code} · ${item.name}`}
              getKeywords={(item) => `${item.equipmentType} ${item.model || ''} ${item.workCenter.code} ${item.workCenter.name}`}
              disabledIds={equipmentIds}
              onSelect={(item) => {
                onEquipmentIdsChange([...equipmentIds, item.id])
                onEquipmentExceptionReasonChange('')
              }}
              placeholder={equipmentOptions.length > 0 ? '搜索并添加本单实际设备' : '订单工作中心暂无可用设备'}
              emptyText="没有匹配的可用/运行中设备"
            />}
            renderIdentity={(item) => <div>
              <div className="text-sm font-medium text-gray-900">{item.code} · {item.name}</div>
              <div className="mt-0.5 text-xs text-gray-500">{item.equipmentType}{item.model ? ` · ${item.model}` : ''} · {item.workCenter.code} {item.workCenter.name} · 记录前状态 {item.status === 'IN_USE' ? '运行中' : '可用'}</div>
            </div>}
            onRemove={(item) => onEquipmentIdsChange(equipmentIds.filter((id) => id !== item.id))}
            emptyText="未选择设备时，必须在下方说明手工作业台、共用设备或主数据缺失原因"
          />
          {equipmentIds.length === 0 && <label className="block border-t border-gray-100 p-3 text-sm font-medium text-gray-700 sm:p-4">设备例外原因
            <textarea value={equipmentExceptionReason} onChange={(event) => onEquipmentExceptionReasonChange(event.target.value)} rows={2} maxLength={200} className={`${appTextareaClassName} mt-2`} placeholder="例如：手工作业台，无独立设备编号" />
          </label>}
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <OneToManyRelationField
            title="作业文件版本"
            items={selectedInstructions}
            getKey={(item) => item.id}
            selector={<RelationSearch
              items={workInstructionOptions}
              getKey={(item) => item.id}
              getLabel={(item) => `${item.title} · ${item.version}`}
              getKeywords={(item) => `${item.category.name} ${item.material?.code || ''} ${item.material?.name || ''} ${item.workCenters.map((center) => `${center.code} ${center.name}`).join(' ')}`}
              disabledIds={workInstructionIds}
              onSelect={(item) => {
                onWorkInstructionIdsChange([...workInstructionIds, item.id])
                onWorkInstructionExceptionReasonChange('')
              }}
              placeholder={workInstructionOptions.length > 0 ? '搜索并添加本单执行文件' : '当前产品/工作中心暂无生效文件'}
              emptyText="没有匹配的生效作业文件"
            />}
            renderIdentity={(item) => <div>
              <div className="text-sm font-medium text-gray-900">{item.title} · {item.version}</div>
              <div className="mt-0.5 text-xs text-gray-500">{item.category.name} · 来源更新 {dateText(item.updatedAt)} · {item.attachments.length} 个附件</div>
            </div>}
            onRemove={(item) => onWorkInstructionIdsChange(workInstructionIds.filter((id) => id !== item.id))}
            emptyText="未选择文件时，必须在下方说明临时工艺、返工参数或文件主数据缺失原因"
          />
          {workInstructionIds.length === 0 && <label className="block border-t border-gray-100 p-3 text-sm font-medium text-gray-700 sm:p-4">作业文件例外原因
            <textarea value={workInstructionExceptionReason} onChange={(event) => onWorkInstructionExceptionReasonChange(event.target.value)} rows={2} maxLength={200} className={`${appTextareaClassName} mt-2`} placeholder="例如：临时返工作业，按现场签字参数执行" />
          </label>}
        </div>
      </div>
    </section>
  )
}

export function ProductionActualExecutionContextSummary({
  equipmentSnapshots,
  workInstructionSnapshots,
  equipmentExceptionReason,
  workInstructionExceptionReason,
}: {
  equipmentSnapshots: ProductionActualEquipmentSnapshot[]
  workInstructionSnapshots: ProductionActualWorkInstructionSnapshot[]
  equipmentExceptionReason?: string | null
  workInstructionExceptionReason?: string | null
}) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-cyan-100 bg-cyan-50/60 p-3 text-sm">
        <div className="mb-2 font-medium text-cyan-900">实际设备快照</div>
        {equipmentSnapshots.length > 0 ? <div className="space-y-2">{equipmentSnapshots.map((item) => <div key={item.id}>
          <div className="font-medium text-cyan-900">{item.equipmentCode} · {item.equipmentName}</div>
          <div className="mt-0.5 text-xs text-cyan-800/80">{item.equipmentType}{item.equipmentModel ? ` · ${item.equipmentModel}` : ''} · {item.workCenterCode} {item.workCenterName} · 当时{item.equipmentStatus === 'IN_USE' ? '运行中' : '可用'}</div>
        </div>)}</div> : <div className="rounded bg-white/70 px-3 py-2 text-xs text-amber-700">例外：{equipmentExceptionReason || '历史实绩未记录设备'}</div>}
      </div>
      <div className="rounded-md border border-violet-100 bg-violet-50/60 p-3 text-sm">
        <div className="mb-2 font-medium text-violet-900">作业文件版本快照</div>
        {workInstructionSnapshots.length > 0 ? <div className="space-y-2">{workInstructionSnapshots.map((item) => {
          const files = attachmentNames(item.attachmentsJson)
          return <div key={item.id}>
            <div className="font-medium text-violet-900">{item.title} · {item.version}</div>
            <div className="mt-0.5 text-xs text-violet-800/80">{item.categoryName}{item.materialCode ? ` · ${item.materialCode} ${item.materialName || ''}` : ''} · 冻结自 {dateText(item.sourceUpdatedAt)}</div>
            {files.length > 0 && <div className="mt-1 truncate text-xs text-violet-700/70" title={files.join('、')}>附件清单：{files.join('、')}</div>}
          </div>
        })}</div> : <div className="rounded bg-white/70 px-3 py-2 text-xs text-amber-700">例外：{workInstructionExceptionReason || '历史实绩未记录作业文件'}</div>}
      </div>
    </div>
  )
}
