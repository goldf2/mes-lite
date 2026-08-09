'use client'

import { Check, ListTree } from 'lucide-react'
import { useState } from 'react'
import ControlTooltip from '../ControlTooltip'
import useDismissibleSearchPopup from '../useDismissibleSearchPopup'
import type { NavigationGroup } from './NavigationModel'

export default function MobileSiblingNavigation({ group }: { group?: NavigationGroup }) {
  if (!group || group.items.length < 2) return null

  return <MobileSiblingNavigationMenu group={group} />
}

function MobileSiblingNavigationMenu({ group }: { group: NavigationGroup }) {
  const [open, setOpen] = useState(false)
  const rootRef = useDismissibleSearchPopup<HTMLDivElement>(open, () => setOpen(false))
  const activeItem = group.items.find((item) => item.active) || group.items[0]

  return (
    <div ref={rootRef} className="relative shrink-0 lg:hidden">
      <button
        type="button"
        aria-label={`${group.label}同级菜单`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`group relative flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm transition ${
          open ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
        }`}
      >
        <ListTree aria-hidden="true" className="h-5 w-5" />
        <ControlTooltip label={`${group.label}同级菜单`} hidden={open} />
      </button>

      {open && (
        <nav
          role="menu"
          aria-label={`${group.label}同级功能`}
          className="absolute left-0 top-full z-40 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
        >
          <div role="presentation" className="px-2.5 py-1.5 text-xs font-semibold text-gray-400">
            {group.label} · {activeItem.label}
          </div>
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-current={item.active ? 'page' : undefined}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                item.active
                  ? 'bg-blue-50 font-semibold text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="truncate">{item.label}</span>
              {item.active && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
