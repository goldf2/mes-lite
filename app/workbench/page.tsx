import { redirect } from 'next/navigation'
import { businessEntryUrls } from '@/lib/platform-entry'

export const dynamic = 'force-dynamic'

/** A stable platform entry; the original MES dashboard remains independently addressable. */
export default function WorkbenchEntry() {
  redirect(businessEntryUrls().platformUrl || '/platform')
}
