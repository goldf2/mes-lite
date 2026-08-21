'use client'

import AiSettingsPage from './ui/AiSettingsPage'
import CadPreviewSettingsPage from './ui/CadPreviewSettingsPage'
import DisplaySettingsPage from './ui/DisplaySettingsPage'
import NavigationSettingsPage from './ui/NavigationSettingsPage'

export const systemSettingsSections = ['displaySettings', 'navigationSettings', 'cadPreviewSettings', 'aiSettings'] as const
export type SystemSettingsSection = typeof systemSettingsSections[number]

export function isSystemSettingsSection(section: string): section is SystemSettingsSection {
  return systemSettingsSections.includes(section as SystemSettingsSection)
}

export default function SystemSettingsSectionPage({ section, onMessage, canUpdate }: { section: SystemSettingsSection; onMessage: (message: string) => void; canUpdate: boolean }) {
  if (section === 'displaySettings') return <DisplaySettingsPage onMessage={onMessage} canUpdate={canUpdate} />
  if (section === 'navigationSettings') return <NavigationSettingsPage onMessage={onMessage} canUpdate={canUpdate} />
  if (section === 'cadPreviewSettings') return <CadPreviewSettingsPage onMessage={onMessage} canUpdate={canUpdate} />
  return <AiSettingsPage onMessage={onMessage} canUpdate={canUpdate} />
}
