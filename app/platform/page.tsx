import type { Metadata } from 'next'
import HomeApp from '../HomeApp'
import { businessEntryUrls } from '@/lib/platform-entry'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '宇峰业务平台' }

/** A separate platform entry; the original MES root and deep links remain intact. */
export default function PlatformPage() {
  return <HomeApp platformEntry {...businessEntryUrls()} />
}
