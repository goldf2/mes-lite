export default function TogglePreferenceRow({
  title,
  description,
  hint,
  enabled,
  onChange,
  disabled = false,
  className = '',
}: {
  title: string
  description: string
  hint?: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-medium text-gray-900">{title}</div>
          <div className="mt-1 text-sm text-gray-500">{description}</div>
          {hint && <div className="mt-2 text-xs text-gray-500">{hint}</div>}
        </div>
        <label className={`inline-flex items-center gap-3 ${disabled ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
          <span className="text-sm text-gray-600">{enabled ? '已开启' : '已关闭'}</span>
          <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
          <span className={`relative h-7 w-12 rounded-full transition ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'left-6' : 'left-1'}`} />
          </span>
        </label>
      </div>
    </section>
  )
}
