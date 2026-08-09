import type { ReactNode } from 'react'
import { ResourcePageShell } from '@/app/components/resource'

export default function SystemSettingsPageShell({
  resourceKey,
  title,
  description,
  children,
}: {
  resourceKey: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <ResourcePageShell
      resourceKey={resourceKey}
      title={title}
      description={description}
      contentClassName="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      {children}
    </ResourcePageShell>
  )
}
