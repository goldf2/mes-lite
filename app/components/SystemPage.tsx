'use client'

import ConfigurationSectionPage, { isConfigurationSection } from '@/modules/configuration'
import { isOperationsToolsSection, OperationsToolsSectionPage } from '@/modules/operations-tools'
import { isProductionEngineeringSection, ProductionEngineeringSectionPage } from '@/modules/production'
import { isSystemSettingsSection, SystemSettingsSectionPage } from '@/modules/system-settings'
import type { RegisteredSystemSection } from '@/lib/page-registry'

export type SystemSection = RegisteredSystemSection

export default function SystemPage({
  section,
  onMessage,
  canCreate,
  canUpdate,
  canDelete,
}: {
  section: SystemSection
  onMessage: (message: string) => void
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}) {
  if (isConfigurationSection(section)) {
    return <ConfigurationSectionPage section={section} onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
  }
  if (isOperationsToolsSection(section)) {
    return <OperationsToolsSectionPage section={section} onMessage={onMessage} canUpdate={canUpdate} canDelete={canDelete} />
  }
  if (isProductionEngineeringSection(section)) {
    return <ProductionEngineeringSectionPage section={section} onMessage={onMessage} canCreate={canCreate} canUpdate={canUpdate} />
  }
  if (isSystemSettingsSection(section)) {
    return <SystemSettingsSectionPage section={section} onMessage={onMessage} canUpdate={canUpdate} />
  }
  return null
}
