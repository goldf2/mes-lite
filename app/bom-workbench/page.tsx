import { notFound } from 'next/navigation'
import BomWorkbenchEntry from '@/app/components/shell/BomWorkbenchEntry'

export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.BOM_WORKBENCH_ENABLED !== '1') notFound()
  return <BomWorkbenchEntry />
}
