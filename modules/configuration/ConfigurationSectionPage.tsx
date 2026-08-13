'use client'

import { WorkCenterSettingsPage } from '@/modules/equipment'
import InventoryLocationSettingsPage from './ui/InventoryLocationSettingsPage'
import PartySettingsPage from './ui/PartySettingsPage'
import UnitSettingsPage from './ui/UnitSettingsPage'
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

export default function ConfigurationSectionPage({ section, onMessage, canCreate, canUpdate, canDelete }: { section: ConfigurationSection; onMessage: (message: string) => void; canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  if (section === 'businessSettings') return <BusinessSettingsPage onMessage={onMessage} canUpdate={canUpdate} />
  if (section === 'suppliers') return <PartySettingsPage kind="supplier" onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
  if (section === 'customers') return <PartySettingsPage kind="customer" onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
  if (section === 'units') return <UnitSettingsPage onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
  if (section === 'locations') return <InventoryLocationSettingsPage onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
  return <WorkCenterSettingsPage onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
}
