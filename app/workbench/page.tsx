import { redirect } from 'next/navigation'

/** A stable platform entry; the original MES dashboard remains independently addressable. */
export default function WorkbenchEntry() {
  redirect('/?page=businessWorkbench')
}
