'use client'

import { useState } from 'react'
import { ExternalLink, PlayCircle } from 'lucide-react'
import type { SopVideo } from '../contracts/sop'

const providerLabels: Record<SopVideo['provider'], string> = {
  file: '视频文件',
  bilibili: '哔哩哔哩',
  youtube: 'YouTube',
}

export default function SopVideoCard({ video }: { video: SopVideo }) {
  const [loaded, setLoaded] = useState(video.provider === 'file')
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-video bg-slate-950">
        {video.provider === 'file' ? (
          <video src={video.playbackUrl} controls preload="metadata" playsInline className="h-full w-full" aria-label={video.title} />
        ) : loaded ? (
          <iframe
            src={video.playbackUrl}
            title={video.title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setLoaded(true)} className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-950 to-blue-950 px-6 text-center text-white hover:from-slate-900 hover:to-blue-900">
            <PlayCircle className="h-14 w-14" />
            <span className="text-sm font-semibold">点击加载 {providerLabels[video.provider]} 播放器</span>
            <span className="text-xs text-slate-300">加载后将连接第三方媒体平台</span>
          </button>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{video.title}</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{providerLabels[video.provider]} · {video.version}</span>
        </div>
        <p className="text-sm leading-6 text-slate-600">{video.description}</p>
        <a href={video.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800">
          <ExternalLink className="h-4 w-4" />新页面打开视频
        </a>
      </div>
    </article>
  )
}
