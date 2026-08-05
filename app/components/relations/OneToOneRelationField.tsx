'use client'

import { ReactNode } from 'react'
import RelationEditorSection from './RelationEditorSection'
import RelationItemRow from './RelationItemRow'

export interface SingleRelationFieldProps<T> {
  title: ReactNode
  item?: T | null
  selector: ReactNode
  renderIdentity: (item: T) => ReactNode
  renderFields?: (item: T) => ReactNode
  onRemove: (item: T) => void
  emptyText?: ReactNode
  removeLabel?: string
}

export default function OneToOneRelationField<T>({
  title,
  item,
  selector,
  renderIdentity,
  renderFields,
  onRemove,
  emptyText = '尚未建立一对一关联',
  removeLabel = '解除关联',
}: SingleRelationFieldProps<T>) {
  return (
    <RelationEditorSection title={title} count={item ? 1 : 0} selector={selector} emptyText={emptyText}>
      {item ? (
        <RelationItemRow
          identity={renderIdentity(item)}
          fields={renderFields?.(item)}
          onRemove={() => onRemove(item)}
          removeLabel={removeLabel}
        />
      ) : null}
    </RelationEditorSection>
  )
}
