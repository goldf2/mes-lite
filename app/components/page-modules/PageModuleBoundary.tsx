'use client'

import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type { PageModuleDefinition, PageModuleKind } from '@/lib/page-modules'

const moduleClassNames: Record<PageModuleKind, string> = {
  workspace: 'mes-page-module-workspace',
  resource: 'mes-page-module-resource',
  'master-detail': 'mes-page-module-master-detail',
  transaction: 'mes-page-module-transaction',
  settings: 'mes-page-module-settings',
  utility: 'mes-page-module-utility',
}

export const PageToolbarRegistrationContext = createContext<(() => () => void) | null>(null)
export const PageModuleKeyContext = createContext('shared')

export default function PageModuleBoundary({
  definition,
  children,
  toolbarProvided = false,
}: {
  definition: PageModuleDefinition
  children: ReactNode
  toolbarProvided?: boolean
}) {
  const [toolbarCount, setToolbarCount] = useState(0)
  const registerToolbar = useCallback(() => {
    setToolbarCount((count) => count + 1)
    return () => setToolbarCount((count) => Math.max(0, count - 1))
  }, [])
  const registration = useMemo(() => registerToolbar, [registerToolbar])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || definition.toolbar !== 'required' || toolbarProvided || toolbarCount > 0) return
    const timer = window.setTimeout(() => {
      console.error(`[PageModuleBoundary] 页面 ${definition.key} 要求使用公共顶部工具栏，但没有注册 TopBarPortal。`)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [definition.key, definition.toolbar, toolbarCount, toolbarProvided])

  const hasToolbar = toolbarProvided || toolbarCount > 0

  return (
    <section
      data-page-module={definition.kind}
      data-page-key={definition.key}
      data-page-toolbar={definition.toolbar}
      data-page-toolbar-registered={hasToolbar ? 'true' : 'false'}
      aria-label={`${definition.title}页面模块`}
      className={`mes-page-module min-h-0 min-w-0 ${moduleClassNames[definition.kind]}`}
    >
      <PageModuleKeyContext.Provider value={definition.key}>
        <PageToolbarRegistrationContext.Provider value={registration}>
          {children}
        </PageToolbarRegistrationContext.Provider>
      </PageModuleKeyContext.Provider>
    </section>
  )
}
