import Image from 'next/image'

export default function AiAssistantMark({
  className = '',
  animated = false,
  priority = false,
}: {
  className?: string
  animated?: boolean
  priority?: boolean
}) {
  return (
    <Image
      src="/ai/assistant-mark.png"
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      className={`${animated ? 'mes-ai-assistant-mark ' : ''}rounded-[22%] ${className}`}
      priority={priority}
    />
  )
}
