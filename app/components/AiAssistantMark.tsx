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
    <span
      aria-hidden="true"
      className={`relative inline-block aspect-square shrink-0 ${animated ? 'mes-ai-assistant-orbit ' : ''}${className}`}
    >
      <Image
        src="/ai/assistant-mark.png"
        alt=""
        fill
        sizes="48px"
        className={`${animated ? 'mes-ai-assistant-mark ' : ''}object-contain`}
        priority={priority}
      />
    </span>
  )
}
