'use client'

import { useState } from 'react'
import { ConfigurationManualOrder } from '@/modules/configuration'
import ProcessRoutePage from './ui/ProcessRoutePage'
import ProcessTemplatePage from './ui/ProcessTemplatePage'

export const productionEngineeringSections = ['processTemplates', 'process'] as const
export type ProductionEngineeringSection = typeof productionEngineeringSections[number]

export function isProductionEngineeringSection(section: string): section is ProductionEngineeringSection {
  return productionEngineeringSections.includes(section as ProductionEngineeringSection)
}

export default function ProductionEngineeringSectionPage({ section, onMessage, canCreate, canUpdate }: { section: ProductionEngineeringSection; onMessage: (message: string) => void; canCreate: boolean; canUpdate: boolean }) {
  const [orderRevision, setOrderRevision] = useState(0)
  const orderConfig = section === 'processTemplates'
    ? { entity: 'processTemplates' as const, label: '加工工艺' }
    : { entity: 'processRoutes' as const, label: '物料路线' }
  const actions = canUpdate ? <ConfigurationManualOrder {...orderConfig} onMessage={onMessage} onSaved={() => setOrderRevision((current) => current + 1)} /> : undefined

  return section === 'processTemplates'
    ? <ProcessTemplatePage key={`${section}-${orderRevision}`} onMessage={onMessage} actions={actions} canCreate={canCreate} canUpdate={canUpdate} />
    : <ProcessRoutePage key={`${section}-${orderRevision}`} onMessage={onMessage} actions={actions} canCreate={canCreate} canUpdate={canUpdate} />
}
