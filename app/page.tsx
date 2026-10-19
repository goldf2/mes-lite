import HomeApp from './HomeApp'
import { businessEntryUrls } from '@/lib/platform-entry'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <HomeApp {...businessEntryUrls()} />
}
