'use client'

import OneToOneRelationField, { SingleRelationFieldProps } from './OneToOneRelationField'

export default function ManyToOneRelationField<T>({
  emptyText = '尚未选择所属项目',
  ...props
}: SingleRelationFieldProps<T>) {
  return <OneToOneRelationField {...props} emptyText={emptyText} />
}
