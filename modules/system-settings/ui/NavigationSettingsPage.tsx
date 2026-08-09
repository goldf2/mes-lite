'use client'

import WorkspaceNavigationSettings from '@/app/components/navigation/WorkspaceNavigationSettings'
import SystemSettingsPageShell from './SystemSettingsPageShell'

export default function NavigationSettingsPage({ onMessage }: { onMessage: (message: string) => void }) {
  return (
    <SystemSettingsPageShell resourceKey="navigationSettings" title="导航与工作区" description="配置 MES、MRP、ERP 菜单范围、页面显示名称与默认顺序。">
      <WorkspaceNavigationSettings onMessage={onMessage} />
    </SystemSettingsPageShell>
  )
}
