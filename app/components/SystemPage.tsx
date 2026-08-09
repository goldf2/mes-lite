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
}: {
  section: SystemSection
  onMessage: (message: string) => void
}) {
  if (isConfigurationSection(section)) {
    return <ConfigurationSectionPage section={section} onMessage={onMessage} />
  }
  if (isOperationsToolsSection(section)) {
    return <OperationsToolsSectionPage section={section} onMessage={onMessage} />
  }
  if (isProductionEngineeringSection(section)) {
    return <ProductionEngineeringSectionPage section={section} onMessage={onMessage} />
  }
  if (isSystemSettingsSection(section)) {
    return <SystemSettingsSectionPage section={section} onMessage={onMessage} />
  }
  return null
}
