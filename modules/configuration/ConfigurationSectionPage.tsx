'use client'

import InventoryLocationSettingsPage from './ui/InventoryLocationSettingsPage'
import PartySettingsPage from './ui/PartySettingsPage'
import UnitSettingsPage from './ui/UnitSettingsPage'
import WorkCenterSettingsPage from './ui/WorkCenterSettingsPage'

export const referenceConfigurationSections = ['suppliers', 'customers', 'units', 'locations', 'workCenters'] as const
export type ReferenceConfigurationSection = typeof referenceConfigurationSections[number]

export function isReferenceConfigurationSection(section: string): section is ReferenceConfigurationSection {
  return referenceConfigurationSections.includes(section as ReferenceConfigurationSection)
}

export default function ConfigurationSectionPage({ section, onMessage }: { section: ReferenceConfigurationSection; onMessage: (message: string) => void }) {
  if (section === 'suppliers') return <PartySettingsPage kind="supplier" onMessage={onMessage} />
  if (section === 'customers') return <PartySettingsPage kind="customer" onMessage={onMessage} />
  if (section === 'units') return <UnitSettingsPage onMessage={onMessage} />
  if (section === 'locations') return <InventoryLocationSettingsPage onMessage={onMessage} />
  return <WorkCenterSettingsPage onMessage={onMessage} />
}
