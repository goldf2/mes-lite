'use client'

import { useState } from 'react'
import ConfigurationManualOrder from '@/app/components/ConfigurationManualOrder'
import ProcessRoutePage from './ui/ProcessRoutePage'
import ProcessTemplatePage from './ui/ProcessTemplatePage'

export const productionEngineeringSections = ['processTemplates', 'process'] as const
export type ProductionEngineeringSection = typeof productionEngineeringSections[number]

export function isProductionEngineeringSection(section: string): section is ProductionEngineeringSection {
  return productionEngineeringSections.includes(section as ProductionEngineeringSection)
}

export default function ProductionEngineeringSectionPage({ section, onMessage }: { section: ProductionEngineeringSection; onMessage: (message: string) => void }) {
  const [orderRevision, setOrderRevision] = useState(0)
  const orderConfig = section === 'processTemplates'
    ? { entity: 'processTemplates' as const, label: '加工工艺' }
    : { entity: 'processRoutes' as const, label: '物料路线' }
  const actions = <ConfigurationManualOrder {...orderConfig} onMessage={onMessage} onSaved={() => setOrderRevision((current) => current + 1)} />

  return section === 'processTemplates'
    ? <ProcessTemplatePage key={`${section}-${orderRevision}`} onMessage={onMessage} actions={actions} />
    : <ProcessRoutePage key={`${section}-${orderRevision}`} onMessage={onMessage} actions={actions} />
}
