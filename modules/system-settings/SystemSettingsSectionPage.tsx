'use client'

import AiSettingsPage from './ui/AiSettingsPage'
import DisplaySettingsPage from './ui/DisplaySettingsPage'
import NavigationSettingsPage from './ui/NavigationSettingsPage'

export const systemSettingsSections = ['displaySettings', 'navigationSettings', 'aiSettings'] as const
export type SystemSettingsSection = typeof systemSettingsSections[number]

export function isSystemSettingsSection(section: string): section is SystemSettingsSection {
  return systemSettingsSections.includes(section as SystemSettingsSection)
}

export default function SystemSettingsSectionPage({ section, onMessage }: { section: SystemSettingsSection; onMessage: (message: string) => void }) {
  if (section === 'displaySettings') return <DisplaySettingsPage onMessage={onMessage} />
  if (section === 'navigationSettings') return <NavigationSettingsPage onMessage={onMessage} />
  return <AiSettingsPage onMessage={onMessage} />
}
