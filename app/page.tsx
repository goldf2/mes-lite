import HomeApp from './HomeApp'
import BomWorkbenchEntry from '@/app/components/shell/BomWorkbenchEntry'
import { businessEntryUrls } from '@/lib/platform-entry'

export const dynamic = 'force-dynamic'

export default function Page({ searchParams }: { searchParams?: { page?: string } }) {
  if (process.env.BOM_WORKBENCH_ENABLED === '1' && !searchParams?.page) {
    return <BomWorkbenchEntry />
  }
  return <HomeApp {...businessEntryUrls()} />
}
