'use client'

import { useState } from 'react'
import { appInputClassName } from '@/app/components/FormField'
import ModalDialog, { ModalActions } from '@/app/components/ModalDialog'
import type { OperatorAdminItem } from '../contracts/operator-admin'

export default function OperatorPasswordResetDialog({
  operator,
  currentOperatorId,
  busy,
  onClose,
  onConfirm,
}: {
  operator: OperatorAdminItem
  currentOperatorId: string
  busy: boolean
  onClose: () => void
  onConfirm: (password: string, confirmPassword: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const passwordError = password.length > 0 && password.length < 10 ? '密码至少 10 位' : ''
  const confirmationError = confirmPassword && password !== confirmPassword ? '两次输入的密码不一致' : ''
  const invalid = !password || !confirmPassword || Boolean(passwordError || confirmationError)

  return (
    <ModalDialog
      title={`重置密码 · ${operator.name}`}
      description={`登录账号：${operator.username}`}
      onClose={onClose}
      closeDisabled={busy}
      fullscreenable={false}
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void onConfirm(password, confirmPassword)}
          confirmLabel="确认重置"
          confirmVariant="danger"
          busy={busy}
          disabled={invalid}
        />
      )}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          重置后，该账号在所有设备上的登录会话都会立即失效；账号状态、角色和权限保持不变。
          {operator.id === currentOperatorId && ' 你正在重置当前账号，保存后需要使用新密码重新登录。'}
        </div>
        <label className="block text-sm font-medium text-gray-700">
          新密码 *
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`mt-2 ${appInputClassName}`}
            autoComplete="new-password"
            minLength={10}
          />
          {passwordError && <span className="mt-1 block text-xs text-red-600">{passwordError}</span>}
        </label>
        <label className="block text-sm font-medium text-gray-700">
          再次输入新密码 *
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={`mt-2 ${appInputClassName}`}
            autoComplete="new-password"
            minLength={10}
          />
          {confirmationError && <span className="mt-1 block text-xs text-red-600">{confirmationError}</span>}
        </label>
      </div>
    </ModalDialog>
  )
}
