export default function ControlTooltip({
  label,
  hidden = false,
}: {
  label: string
  hidden?: boolean
}) {
  if (hidden) return null

  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-[180] mt-2 max-w-52 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-semibold leading-4 text-white opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:delay-300 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 group-focus-visible:delay-0 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-focus-within:delay-0"
    >
      {label}
    </span>
  )
}
