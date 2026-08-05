'use client'

import { ReactNode } from 'react'
import type { PageModuleDefinition, PageModuleKind } from '@/lib/page-modules'

const moduleClassNames: Record<PageModuleKind, string> = {
  workspace: 'mes-page-module-workspace',
  resource: 'mes-page-module-resource',
  'master-detail': 'mes-page-module-master-detail',
  transaction: 'mes-page-module-transaction',
  settings: 'mes-page-module-settings',
  utility: 'mes-page-module-utility',
}

export default function PageModuleBoundary({ definition, children }: { definition: PageModuleDefinition; children: ReactNode }) {
  return (
    <section
      data-page-module={definition.kind}
      data-page-key={definition.key}
      aria-label={`${definition.title}页面模块`}
      className={`mes-page-module min-h-0 min-w-0 ${moduleClassNames[definition.kind]}`}
    >
      {children}
    </section>
  )
}
