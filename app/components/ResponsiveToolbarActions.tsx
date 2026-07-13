'use client'

import { ReactNode, useState } from 'react'

export default function ResponsiveToolbarActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex justify-end">
      <div className="hidden flex-wrap items-center justify-end gap-3 2xl:flex">
        {children}
      </div>
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 2xl:hidden"
      >
        筛选/操作
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(88vw,420px)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg 2xl:hidden">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
