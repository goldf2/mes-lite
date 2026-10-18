'use client'

import type { WorkspaceFunctionKey, WorkspacePreferenceValue } from '@/lib/workspace'
import { WorkspaceLauncher, type WorkspaceFunctionItem } from './WorkspacePages'
import type { SaveWorkspacePreference } from './WorkspaceFunctionCatalog'

interface BusinessWorkbenchPageProps {
  items: WorkspaceFunctionItem[]
  preference: WorkspacePreferenceValue
  onOpen: (functionKey: WorkspaceFunctionKey) => void
  onOpenAllFunctions: () => void
  onSave: SaveWorkspacePreference
  preferenceBusy?: boolean
}

export default function BusinessWorkbenchPage(props: BusinessWorkbenchPageProps) {
  return <WorkspaceLauncher {...props} title="宇峰业务工作台" />
}
