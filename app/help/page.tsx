import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentOperator } from '@/lib/auth'
import { SopHelpCenterPage } from '@/modules/sop'

export const metadata: Metadata = {
  title: 'MES-lite 全屏帮助中心',
}

export default async function FullscreenHelpPage({ searchParams }: { searchParams?: { pageKey?: string } }) {
  const operator = await getCurrentOperator()
  if (!operator) redirect('/')
  const pageKey = searchParams?.pageKey?.trim() || undefined
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-8">
      <SopHelpCenterPage pageKey={pageKey} standalone />
    </main>
  )
}
