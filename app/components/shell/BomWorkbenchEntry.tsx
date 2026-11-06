'use client'

import { useCallback, useState } from 'react'
import AuthGate, { type CurrentOperator } from '@/app/components/AuthGate'
import AppButton from '@/app/components/AppButton'
import { BomWorkbenchPage } from '@/modules/bom'
import { loadConfiguredUnits } from '@/modules/configuration'

function Workspace({ operator, onLogout }: { operator: CurrentOperator; onLogout: () => void }) {
  const [message, setMessage] = useState('')
  const onMessage = useCallback((value: string) => setMessage(value), [])
  const permission = operator.permissions?.bom
  const admin = operator.role === 'ADMIN'
  return <main className="mx-auto min-h-screen max-w-[1600px] space-y-4 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">BOM 工作台</h1><p className="text-sm text-gray-500">配方、投入产出与版本管理</p></div>
      <div className="flex items-center gap-3"><a className="text-sm text-blue-700 underline" href="/?page=materials" target="_blank" rel="noreferrer">物料资料</a><span className="text-sm">{operator.name}</span><AppButton onClick={onLogout}>退出登录</AppButton></div>
    </header>
    {message && <div role="status" className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}<AppButton size="sm" onClick={() => setMessage('')}>关闭</AppButton></div>}
    {admin || permission?.canRead
      ? <BomWorkbenchPage loadUnits={loadConfiguredUnits} onMessage={onMessage} canCreate={admin || !!permission?.canCreate} canUpdate={admin || !!permission?.canUpdate} canDelete={admin || !!permission?.canDelete} />
      : <p role="alert">当前账号没有 BOM 查看权限。</p>}
  </main>
}

export default function BomWorkbenchEntry() {
  return <AuthGate>{(operator, onLogout) => <Workspace operator={operator} onLogout={onLogout} />}</AuthGate>
}
