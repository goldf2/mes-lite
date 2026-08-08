'use client'

import {
  enabledNavigationWorkspaces,
  navigationWorkspaceLabels,
  type NavigationWorkspaceId,
  type WorkspaceNavigationConfig,
} from '@/lib/workspace-navigation-config'

export default function WorkspaceDomainTabs({
  config,
  value,
  onChange,
  compact = false,
}: {
  config: WorkspaceNavigationConfig
  value: NavigationWorkspaceId
  onChange: (workspace: NavigationWorkspaceId) => void
  compact?: boolean
}) {
  const workspaces = enabledNavigationWorkspaces(config)
  return (
    <div
      role="tablist"
      aria-label="业务工作区"
      className={`grid min-w-0 grid-flow-col auto-cols-fr rounded-lg border border-gray-200 bg-gray-100 p-1 ${compact ? 'h-9' : 'h-10'}`}
    >
      {workspaces.map((workspace) => (
        <button
          key={workspace}
          type="button"
          role="tab"
          aria-selected={value === workspace}
          onClick={() => onChange(workspace)}
          className={`min-w-0 rounded-md px-2 text-xs font-bold tracking-wide transition ${
            value === workspace
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-500 hover:bg-white hover:text-gray-900'
          }`}
        >
          {navigationWorkspaceLabels[workspace]}
        </button>
      ))}
    </div>
  )
}
