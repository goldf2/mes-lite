'use client'

import { ReactNode } from 'react'
import RelationEditorSection from './RelationEditorSection'
import RelationItemRow from './RelationItemRow'

export default function OneToManyRelationField<T>({
  title,
  items,
  getKey,
  selector,
  renderIdentity,
  renderFields,
  onRemove,
  emptyText = '尚未添加关联项目',
  removeLabel = '移除',
}: {
  title: ReactNode
  items: T[]
  getKey: (item: T) => string
  selector: ReactNode
  renderIdentity: (item: T) => ReactNode
  renderFields?: (item: T) => ReactNode
  onRemove: (item: T) => void
  emptyText?: ReactNode
  removeLabel?: string
}) {
  return (
    <RelationEditorSection title={title} count={items.length} selector={selector} emptyText={emptyText}>
      {items.map((item) => (
        <RelationItemRow
          key={getKey(item)}
          identity={renderIdentity(item)}
          fields={renderFields?.(item)}
          onRemove={() => onRemove(item)}
          removeLabel={removeLabel}
        />
      ))}
    </RelationEditorSection>
  )
}
