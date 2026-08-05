'use client'

import { ReactNode } from 'react'
import ModalDialog, { ModalActions } from '../ModalDialog'

export default function ResourceFormDialog({
  open,
  editing,
  createTitle,
  editTitle,
  description,
  onClose,
  onConfirm,
  saving,
  disabled = false,
  size = 'md',
  confirmLabel = '保存',
  cancelLabel = '取消',
  children,
}: {
  open: boolean
  editing: boolean
  createTitle: ReactNode
  editTitle: ReactNode
  description?: ReactNode
  onClose: () => void
  onConfirm: () => void
  saving: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide'
  confirmLabel?: string
  cancelLabel?: string
  children: ReactNode
}) {
  if (!open) return null

  return (
    <ModalDialog
      title={editing ? editTitle : createTitle}
      description={description}
      onClose={onClose}
      closeDisabled={saving}
      size={size}
      footer={<ModalActions onCancel={onClose} onConfirm={onConfirm} busy={saving} disabled={disabled} confirmLabel={confirmLabel} cancelLabel={cancelLabel} />}
    >
      {children}
    </ModalDialog>
  )
}
