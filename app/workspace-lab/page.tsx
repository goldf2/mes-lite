import type { Metadata } from 'next'
import DockingWorkspaceLab from './DockingWorkspaceLab'

export const metadata: Metadata = {
  title: '可停靠工作区实验室 · MES-lite',
  description: 'MES-lite 导航、工具和主显示区域的工作区布局实验。',
}

export default function WorkspaceLabPage() {
  return <DockingWorkspaceLab />
}
