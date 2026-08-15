'use client'

import WorkspaceNavigationSettings from './WorkspaceNavigationSettings'
import SystemSettingsPageShell from './SystemSettingsPageShell'

export default function NavigationSettingsPage({ onMessage, canUpdate }: { onMessage: (message: string) => void; canUpdate: boolean }) {
  return (
    <SystemSettingsPageShell resourceKey="navigationSettings" title="导航设置" description="配置统一 MES 工作台的功能分区、页面显示名称与默认顺序。">
      <WorkspaceNavigationSettings onMessage={onMessage} canUpdate={canUpdate} />
    </SystemSettingsPageShell>
  )
}
