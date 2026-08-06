'use client'

import { useMemo, useState } from 'react'
import AppButton from '../AppButton'
import FormField, { appInputClassName, appSelectClassName } from '../FormField'
import ModalDialog, { ModalActions } from '../ModalDialog'
import { MaterialRelationIdentity, MaterialRelationOption, MaterialRelationSearch } from '../relations/MaterialRelation'
import OneToManyRelationField from '../relations/OneToManyRelationField'
import { usePersistedDisplayMode } from '../ViewModeToggle'
import MultiSelectFilterMenu from './MultiSelectFilterMenu'
import ResourceDetailPanel from './ResourceDetailPanel'
import ResourceFormDialog from './ResourceFormDialog'
import ResourcePage from './ResourcePage'
import { ResourceTableColumn } from './ResourceTable'

type LabState = 'ready' | 'loading' | 'empty' | 'error'
type DocumentStatus = 'active' | 'archived'

interface LabDocument {
  id: string
  code: string
  title: string
  category: string
  status: DocumentStatus
  updatedAt: string
  materialIds: string[]
}

interface DocumentDraft {
  title: string
  category: string
  materialIds: string[]
}

const materials: MaterialRelationOption[] = [
  { id: 'mat-1', code: 'MAT-001', name: '主动轴', spec: 'Φ25 × 180', stockUnit: '件' },
  { id: 'mat-2', code: 'MAT-002', name: '从动齿轮', spec: 'M2 Z40', stockUnit: '件' },
  { id: 'mat-3', code: 'MAT-003', name: '防护罩', spec: 'Q235 1.5mm', stockUnit: '件' },
  { id: 'mat-4', code: 'MAT-004', name: '定位套', spec: 'Φ32 × 45', stockUnit: '件' },
]

const labDisplayModes = ['card', 'list', 'columns', 'gallery'] as const

const initialDocuments: LabDocument[] = [
  {
    id: 'doc-1',
    code: 'WI-0001',
    title: '传动组件装配作业指导书',
    category: '装配指导书',
    status: 'active',
    updatedAt: '2026-08-05 09:30',
    materialIds: ['mat-1', 'mat-2'],
  },
  {
    id: 'doc-2',
    code: 'WI-0002',
    title: '防护罩折弯与检验规范',
    category: '加工作业指导书',
    status: 'active',
    updatedAt: '2026-08-04 16:20',
    materialIds: ['mat-3'],
  },
  {
    id: 'doc-3',
    code: 'WI-0003',
    title: '轴套清洗包装要求',
    category: '包装规范',
    status: 'active',
    updatedAt: '2026-08-03 11:10',
    materialIds: ['mat-1', 'mat-4'],
  },
  {
    id: 'doc-4',
    code: 'WI-0004',
    title: '旧版齿轮检测记录模板',
    category: '检验规范',
    status: 'archived',
    updatedAt: '2026-07-28 14:00',
    materialIds: ['mat-2'],
  },
]

function statusBadge(status: DocumentStatus) {
  return status === 'active' ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">启用</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">已归档</span>
  )
}

function draftFrom(document: LabDocument): DocumentDraft {
  return {
    title: document.title,
    category: document.category,
    materialIds: [...document.materialIds],
  }
}

export default function ResourceFrameworkLab() {
  const [documents, setDocuments] = useState(initialDocuments)
  const [query, setQuery] = useState('')
  const [statusFilters, setStatusFilters] = useState<DocumentStatus[]>(['active', 'archived'])
  const [viewMode, setViewMode] = usePersistedDisplayMode(
    'mes-lite.resource.framework-lab-documents.display-mode.v1',
    'list',
    labDisplayModes,
  )
  const [selectedId, setSelectedId] = useState<string | null>('doc-1')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DocumentDraft>(() => draftFrom(initialDocuments[0]))
  const [saving, setSaving] = useState(false)
  const [labState, setLabState] = useState<LabState>('ready')
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<DocumentDraft>({ title: '', category: '装配指导书', materialIds: [] })
  const [archiveTarget, setArchiveTarget] = useState<LabDocument | null>(null)
  const [notice, setNotice] = useState('')

  const visibleDocuments = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN')
    return documents.filter((document) => {
      if (!statusFilters.includes(document.status)) return false
      if (!keyword) return true
      const relatedMaterials = document.materialIds
        .map((id) => materials.find((material) => material.id === id))
        .filter(Boolean)
        .map((material) => `${material?.code} ${material?.name}`)
        .join(' ')
      return `${document.code} ${document.title} ${document.category} ${relatedMaterials}`.toLocaleLowerCase('zh-CN').includes(keyword)
    })
  }, [documents, query, statusFilters])

  const displayedDocuments = labState === 'empty' ? [] : visibleDocuments
  const selected = documents.find((document) => document.id === selectedId) || null
  const selectedPosition = selected ? visibleDocuments.findIndex((document) => document.id === selected.id) : -1

  const selectDocument = (document: LabDocument) => {
    if (editing && selected && document.id !== selected.id && !window.confirm('当前修改尚未保存，确定切换到其他文档吗？')) return
    setSelectedId(document.id)
    setEditing(false)
    setDraft(draftFrom(document))
    setNotice('')
  }

  const startEditing = () => {
    if (!selected) return
    setDraft(draftFrom(selected))
    setEditing(true)
    setNotice('')
  }

  const saveEdit = () => {
    if (!selected || !draft.title.trim()) return
    setSaving(true)
    window.setTimeout(() => {
      setDocuments((current) => current.map((document) => document.id === selected.id ? {
        ...document,
        title: draft.title.trim(),
        category: draft.category,
        materialIds: draft.materialIds,
        updatedAt: '刚刚',
      } : document))
      setSaving(false)
      setEditing(false)
      setNotice('已保存，列表位置和当前文档保持不变。')
    }, 350)
  }

  const moveSelection = (direction: -1 | 1) => {
    if (selectedPosition < 0) return
    const next = visibleDocuments[selectedPosition + direction]
    if (next) selectDocument(next)
  }

  const createDocument = () => {
    if (!createDraft.title.trim()) return
    setSaving(true)
    window.setTimeout(() => {
      const nextNumber = documents.length + 1
      const created: LabDocument = {
        id: `doc-${Date.now()}`,
        code: `WI-${String(nextNumber).padStart(4, '0')}`,
        title: createDraft.title.trim(),
        category: createDraft.category,
        status: 'active',
        updatedAt: '刚刚',
        materialIds: createDraft.materialIds,
      }
      setDocuments((current) => [created, ...current])
      setCreateOpen(false)
      setCreateDraft({ title: '', category: '装配指导书', materialIds: [] })
      setSaving(false)
      setSelectedId(created.id)
      setDraft(draftFrom(created))
      setNotice('已创建并自动打开新文档。')
    }, 350)
  }

  const archiveDocument = () => {
    if (!archiveTarget) return
    const targetId = archiveTarget.id
    setDocuments((current) => current.map((document) => document.id === targetId ? { ...document, status: 'archived', updatedAt: '刚刚' } : document))
    setArchiveTarget(null)
    setEditing(false)
    setNotice('文档已归档，当前上下文仍然保留。')
  }

  const columns: ResourceTableColumn<LabDocument>[] = [
    {
      key: 'code',
      label: '文档编码',
      className: 'whitespace-nowrap font-mono text-xs text-gray-600',
      render: (document) => document.code,
    },
    {
      key: 'title',
      label: '文档标题',
      render: (document) => (
        <div>
          <div className="font-medium text-gray-900">{document.title}</div>
          <div className="mt-0.5 text-xs text-gray-500">关联 {document.materialIds.length} 个物料</div>
        </div>
      ),
    },
    { key: 'category', label: '类别', hideBelow: 'lg', render: (document) => document.category },
    { key: 'status', label: '状态', className: 'whitespace-nowrap', headerClassName: 'whitespace-nowrap', render: (document) => statusBadge(document.status) },
    { key: 'updatedAt', label: '更新时间', hideBelow: 'xl', render: (document) => document.updatedAt },
  ]

  const detail = selected ? (
    <ResourceDetailPanel
      title={editing ? draft.title || '未命名文档' : selected.title}
      subtitle={`${selected.code} · ${selected.category}`}
      status={statusBadge(selected.status)}
      editing={editing}
      position={selectedPosition >= 0 ? selectedPosition + 1 : undefined}
      total={visibleDocuments.length}
      onPrevious={!editing && selectedPosition > 0 ? () => moveSelection(-1) : undefined}
      onNext={!editing && selectedPosition >= 0 && selectedPosition < visibleDocuments.length - 1 ? () => moveSelection(1) : undefined}
      onEdit={selected.status === 'active' ? startEditing : undefined}
      onClose={() => {
        if (editing && !window.confirm('当前修改尚未保存，确定关闭详情吗？')) return
        setSelectedId(null)
        setEditing(false)
      }}
      moreActions={!editing && selected.status === 'active' ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          onClick={() => setArchiveTarget(selected)}
        >
          归档文档
        </button>
      ) : undefined}
      footer={editing ? (
        <>
          <AppButton onClick={() => {
            setDraft(draftFrom(selected))
            setEditing(false)
          }} disabled={saving}>取消</AppButton>
          <AppButton variant="primary" onClick={saveEdit} disabled={saving || !draft.title.trim()}>{saving ? '处理中…' : '保存修改'}</AppButton>
        </>
      ) : undefined}
    >
      {notice && <div role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      {editing ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FormField label="文档标题" required>
              <input aria-label="编辑文档标题" className={appInputClassName} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </FormField>
            <FormField label="文档类别" required>
              <select aria-label="编辑文档类别" className={appSelectClassName} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>
                <option>装配指导书</option>
                <option>加工作业指导书</option>
                <option>检验规范</option>
                <option>包装规范</option>
              </select>
            </FormField>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <OneToManyRelationField
              title="关联物料"
              items={draft.materialIds}
              getKey={(materialId) => materialId}
              selector={(
                <MaterialRelationSearch
                  materials={materials}
                  disabledIds={draft.materialIds}
                  onAdd={(materialId) => setDraft((current) => ({ ...current, materialIds: [...current.materialIds, materialId] }))}
                />
              )}
              emptyText="尚未关联物料"
              renderIdentity={(materialId) => <MaterialRelationIdentity material={materials.find((material) => material.id === materialId)} fallbackId={materialId} />}
              onRemove={(materialId) => setDraft((current) => ({ ...current, materialIds: current.materialIds.filter((id) => id !== materialId) }))}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-gray-900">基本信息</h3>
            <dl className="mes-resource-detail-muted-card mes-resource-detail-dividers mt-2 grid grid-cols-2 divide-x rounded-lg border px-3 py-2.5 text-sm">
              <div className="min-w-0 pr-3"><dt className="mes-resource-detail-label text-xs">类别</dt><dd className="mes-resource-detail-value mt-1 truncate font-medium">{selected.category}</dd></div>
              <div className="min-w-0 pl-3"><dt className="mes-resource-detail-label text-xs">更新时间</dt><dd className="mes-resource-detail-value mt-1 truncate font-medium">{selected.updatedAt}</dd></div>
            </dl>
          </section>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">关联物料</h3>
              <span className="text-xs text-gray-500">{selected.materialIds.length} 项</span>
            </div>
            <div className="mes-resource-detail-dividers mt-2 divide-y border-y px-1">
              {selected.materialIds.map((materialId) => (
                <div key={materialId} className="py-3">
                  <MaterialRelationIdentity material={materials.find((material) => material.id === materialId)} fallbackId={materialId} />
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-gray-900">最近活动</h3>
            <div className="mes-resource-detail-soft-row mt-2 border-y px-3 py-3 text-sm">{selected.updatedAt} · 更新文档资料</div>
          </section>
        </div>
      )}
    </ResourceDetailPanel>
  ) : undefined

  return (
    <div className="space-y-3">
      <section aria-label="实验室状态控制" className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-amber-800">
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">实验</span>
          <span className="truncate font-medium">公共资源页面框架</span>
          <span className="hidden truncate text-amber-700 lg:inline">内存模拟数据 · 不连接业务 API</span>
        </div>
        <label className="sm:hidden">
          <span className="sr-only">实验状态</span>
          <select
            aria-label="实验状态"
            value={labState}
            onChange={(event) => setLabState(event.target.value as LabState)}
            className="h-8 rounded-md border border-amber-300 bg-white px-2 text-xs font-medium text-amber-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          >
            <option value="ready">正常</option>
            <option value="loading">加载</option>
            <option value="empty">空数据</option>
            <option value="error">错误</option>
          </select>
        </label>
        <div className="hidden flex-wrap gap-1.5 sm:flex" role="group" aria-label="切换页面状态">
          {([
            ['ready', '正常'],
            ['loading', '加载'],
            ['empty', '空数据'],
            ['error', '错误'],
          ] as const).map(([state, label]) => (
            <button
              key={state}
              type="button"
              aria-pressed={labState === state}
              onClick={() => setLabState(state)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${labState === state ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <ResourcePage
        resourceKey="framework-lab-documents"
        title="产品文档"
        description="验证列表、卡片、连续详情、同容器编辑和多物料关联的标准骨架。"
        items={displayedDocuments}
        getKey={(document) => document.id}
        columns={columns}
        renderCard={({ item }) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-xs text-gray-500">{item.code}</span>
              {statusBadge(item.status)}
            </div>
            <h2 className="mt-3 line-clamp-2 font-medium text-gray-900">{item.title}</h2>
            <div className="mt-2 text-xs text-gray-500">{item.category} · 关联 {item.materialIds.length} 个物料</div>
          </div>
        )}
        selectedKey={selectedId}
        onSelect={selectDocument}
        detail={detail}
        loading={labState === 'loading'}
        error={labState === 'error' ? '这是用于验证失败反馈和重新加载入口的模拟错误。' : undefined}
        onRetry={() => setLabState('ready')}
        emptyLabel={query || statusFilters.length !== 2 ? '当前搜索或筛选没有结果' : '尚未创建产品文档'}
        emptyAction={<AppButton variant="create" size="sm" onClick={() => setCreateOpen(true)}>新增文档</AppButton>}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索文档编码、标题、类别或关联物料"
        filters={(
          <MultiSelectFilterMenu
            label="文档状态"
            options={[
              { value: 'active', label: '启用', description: '当前可用的正式文档', count: documents.filter((document) => document.status === 'active').length },
              { value: 'archived', label: '已归档', description: '保留记录但不再默认使用', count: documents.filter((document) => document.status === 'archived').length },
            ]}
            selectedValues={statusFilters}
            onChange={(values) => setStatusFilters(values as DocumentStatus[])}
          />
        )}
        filterCount={statusFilters.length === 2 ? 0 : 1}
        filterSummary={statusFilters.length === 2 ? undefined : (
          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
            {statusFilters.length === 0 ? '未选择状态' : statusFilters[0] === 'active' ? '启用' : '已归档'}
          </span>
        )}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        displayModes={labDisplayModes}
        onCreate={() => setCreateOpen(true)}
        createLabel="新增文档"
        summary={<span className="text-sm text-gray-500">共 {visibleDocuments.length} 条</span>}
        toolbarPlacement="inline"
        rowLabel={(document) => `打开文档 ${document.code} ${document.title}`}
      />

      <ResourceFormDialog
        open={createOpen}
        editing={false}
        createTitle="新增产品文档"
        editTitle="编辑产品文档"
        description="这是公共新增弹窗的独立测试，不会调用真实接口。"
        onClose={() => setCreateOpen(false)}
        onConfirm={createDocument}
        saving={saving}
        disabled={!createDraft.title.trim()}
        size="lg"
        confirmLabel="创建文档"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="文档标题" required>
              <input aria-label="新增文档标题" className={appInputClassName} value={createDraft.title} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} />
            </FormField>
            <FormField label="文档类别" required>
              <select aria-label="新增文档类别" className={appSelectClassName} value={createDraft.category} onChange={(event) => setCreateDraft((current) => ({ ...current, category: event.target.value }))}>
                <option>装配指导书</option>
                <option>加工作业指导书</option>
                <option>检验规范</option>
                <option>包装规范</option>
              </select>
            </FormField>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <OneToManyRelationField
              title="关联物料"
              items={createDraft.materialIds}
              getKey={(materialId) => materialId}
              selector={<MaterialRelationSearch materials={materials} disabledIds={createDraft.materialIds} onAdd={(materialId) => setCreateDraft((current) => ({ ...current, materialIds: [...current.materialIds, materialId] }))} />}
              emptyText="可以在创建时关联多个物料"
              renderIdentity={(materialId) => <MaterialRelationIdentity material={materials.find((material) => material.id === materialId)} fallbackId={materialId} />}
              onRemove={(materialId) => setCreateDraft((current) => ({ ...current, materialIds: current.materialIds.filter((id) => id !== materialId) }))}
            />
          </div>
        </div>
      </ResourceFormDialog>

      {archiveTarget && (
        <ModalDialog
          title="归档产品文档"
          description="归档后记录仍可恢复，不会删除附件。"
          onClose={() => setArchiveTarget(null)}
          size="sm"
          footer={<ModalActions onCancel={() => setArchiveTarget(null)} onConfirm={archiveDocument} confirmLabel="确认归档" confirmVariant="danger" />}
        >
          <p className="text-sm text-gray-700">确定归档“{archiveTarget.title}”吗？当前详情位置将继续保留。</p>
        </ModalDialog>
      )}
    </div>
  )
}
