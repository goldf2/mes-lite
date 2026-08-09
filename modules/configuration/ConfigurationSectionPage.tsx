'use client'

import InventoryLocationSettingsPage from './ui/InventoryLocationSettingsPage'
import PartySettingsPage from './ui/PartySettingsPage'
import UnitSettingsPage from './ui/UnitSettingsPage'
import WorkCenterSettingsPage from './ui/WorkCenterSettingsPage'
import BusinessSettingsPage from './ui/BusinessSettingsPage'

export const referenceConfigurationSections = ['suppliers', 'customers', 'units', 'locations', 'workCenters'] as const
export type ReferenceConfigurationSection = typeof referenceConfigurationSections[number]
export const configurationSections = [...referenceConfigurationSections, 'businessSettings'] as const
export type ConfigurationSection = typeof configurationSections[number]

export function isReferenceConfigurationSection(section: string): section is ReferenceConfigurationSection {
  return referenceConfigurationSections.includes(section as ReferenceConfigurationSection)
}

export function isConfigurationSection(section: string): section is ConfigurationSection {
  return configurationSections.includes(section as ConfigurationSection)
}

export default function ConfigurationSectionPage({ section, onMessage }: { section: ConfigurationSection; onMessage: (message: string) => void }) {
  if (section === 'businessSettings') return <BusinessSettingsPage onMessage={onMessage} />
  if (section === 'suppliers') return <PartySettingsPage kind="supplier" onMessage={onMessage} />
  if (section === 'customers') return <PartySettingsPage kind="customer" onMessage={onMessage} />
  if (section === 'units') return <UnitSettingsPage onMessage={onMessage} />
  if (section === 'locations') return <InventoryLocationSettingsPage onMessage={onMessage} />
  return <WorkCenterSettingsPage onMessage={onMessage} />
}
