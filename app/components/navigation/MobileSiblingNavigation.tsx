'use client'

import type { NavigationGroup } from './NavigationModel'

export default function MobileSiblingNavigation({ group }: { group?: NavigationGroup }) {
  if (!group || group.items.length < 2) return null

  return (
    <nav
      aria-label={`${group.label}同级功能`}
      className="mb-4 flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 lg:hidden"
    >
      {group.items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.active ? 'page' : undefined}
          onClick={item.onClick}
          className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            item.active
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
