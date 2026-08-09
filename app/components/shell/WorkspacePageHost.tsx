'use client'

import { createPortal } from 'react-dom'
import PageModuleBoundary from '../page-modules/PageModuleBoundary'
import type { PageModuleDefinition } from '@/lib/page-modules'
import {
  renderRegisteredWorkspacePage,
  type WorkspacePageRenderContext,
} from './WorkspacePageRendererRegistry'

interface WorkspacePageHostProps extends WorkspacePageRenderContext {
  definition: PageModuleDefinition
  message: string
}

export default function WorkspacePageHost({
  definition,
  message,
  ...renderContext
}: WorkspacePageHostProps) {
  return (
    <PageModuleBoundary definition={definition} toolbarProvided={definition.hostToolbarProvided}>
      {message && createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:left-auto sm:right-4 sm:top-20 sm:w-[min(32rem,calc(100vw-2rem))] sm:px-0">
          <div role="status" aria-live="polite" className={`w-full rounded-lg border p-4 text-sm shadow-xl ${
            message.includes('成功') || message.includes('完成') || message.includes('补齐')
              ? 'border-green-200 bg-green-100 text-green-700'
              : 'border-red-200 bg-red-100 text-red-700'
          }`}>
            {message}
          </div>
        </div>,
        document.body,
      )}

      {renderRegisteredWorkspacePage(definition, renderContext)}
    </PageModuleBoundary>
  )
}
