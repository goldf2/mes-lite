import AiAssistantMark from './AiAssistantMark'

export default function AppLoadingIndicator({
  label = '加载中...',
  fullScreen = false,
}: {
  label?: string
  fullScreen?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 text-sm text-gray-500 ${fullScreen ? 'min-h-screen bg-gray-50' : 'py-12'}`}
    >
      <AiAssistantMark
        animated
        priority={fullScreen}
        className={fullScreen ? 'h-16 w-16' : 'h-12 w-12'}
      />
      <span>{label}</span>
    </div>
  )
}
