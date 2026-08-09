'use client'

import ArchiveRecordsPage from './ArchiveRecordsPage'
import AuditLogPage from './AuditLogPage'
import DataToolsPage from './DataToolsPage'

export const operationsToolsSections = ['recycle', 'audit', 'dataTools'] as const
export type OperationsToolsSection = (typeof operationsToolsSections)[number]

export function isOperationsToolsSection(section: string): section is OperationsToolsSection {
  return operationsToolsSections.includes(section as OperationsToolsSection)
}

export default function OperationsToolsSectionPage({
  section,
  onMessage,
}: {
  section: OperationsToolsSection
  onMessage: (message: string) => void
}) {
  if (section === 'recycle') return <ArchiveRecordsPage onMessage={onMessage} />
  if (section === 'audit') return <AuditLogPage onMessage={onMessage} />
  return <DataToolsPage onMessage={onMessage} />
}
