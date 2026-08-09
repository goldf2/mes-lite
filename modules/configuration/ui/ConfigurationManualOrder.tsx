'use client'

import { useState } from 'react'
import type { ConfigurationOrderEntity } from '../contracts/configuration-order'
import { loadConfigurationOrder, saveConfigurationOrderPreference } from '../client/configuration-order-api'
import AppButton from '@/app/components/AppButton'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import AppLoadingIndicator from '@/app/components/AppLoadingIndicator'

interface OrderItem {
  id: string
  label: string
  detail?: string
  group?: string
  sortOrder: number
}

export default function ConfigurationManualOrder({
  entity,
  label,
  onMessage,
  onSaved,
}: {
  entity: ConfigurationOrderEntity
  label: string
  onMessage: (message: string) => void
  onSaved?: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const openDialog = async () => {
    setOpen(true)
    setLoading(true)
    try {
      setItems(await loadConfigurationOrder(entity))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `获取${label}顺序失败`)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= items.length) return
    if (items[index].group !== items[targetIndex].group) return
    setItems((current) => {
      const next = [...current]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const data = await saveConfigurationOrderPreference(entity, items.map((item) => item.id))
      setItems(data.data || [])
      setOpen(false)
      onMessage(data.message || `${label}默认顺序已保存`)
      await onSaved?.()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `保存${label}顺序失败`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AppButton onClick={openDialog}>调整顺序</AppButton>
      {open && (
        <ModalDialog
          title={`${label}顺序调整`}
          description="保存后作为所有终端的默认顺序；点击列表表头产生的临时排序不会覆盖这里的设置。"
          onClose={() => setOpen(false)}
          closeDisabled={saving}
          size="lg"
          footer={<ModalActions onCancel={() => setOpen(false)} onConfirm={save} busy={saving} disabled={loading || items.length === 0} confirmLabel="保存顺序" />}
        >
          {loading ? (
            <AppLoadingIndicator compact label="正在加载排序数据..." />
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">暂无可排序内容</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => {
                const firstInGroup = index === 0 || items[index - 1].group !== item.group
                const previousInGroup = index > 0 && items[index - 1].group === item.group
                const nextInGroup = index < items.length - 1 && items[index + 1].group === item.group
                return (
                  <div key={item.id}>
                    {item.group && firstInGroup && <div className="pb-1 pt-3 text-xs font-semibold text-gray-500 first:pt-0">{item.group}</div>}
                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                      <span className="w-8 shrink-0 text-center font-mono text-xs text-gray-400">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">{item.label}</div>
                        {item.detail && <div className="mt-1 truncate text-xs text-gray-500">{item.detail}</div>}
                      </div>
                      <AppButton size="icon" variant="ghost" disabled={!previousInGroup} onClick={() => move(index, -1)} aria-label={`上移${item.label}`} title="上移">↑</AppButton>
                      <AppButton size="icon" variant="ghost" disabled={!nextInGroup} onClick={() => move(index, 1)} aria-label={`下移${item.label}`} title="下移">↓</AppButton>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ModalDialog>
      )}
    </>
  )
}
