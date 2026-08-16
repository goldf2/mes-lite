import type { SopVideo, SopVideoProvider } from '../contracts/sop'
import { normalizePublicBaseUrl } from './sop-downloads'

type SopVideoManifestBase = {
  id: string
  title: string
  description: string
  provider: SopVideoProvider
  version: string
  chapterId: string
  workflowIds: string[]
  sortOrder?: number
  resource: string
  pageKeys?: string[]
}

export type SopVideoManifestEntry = SopVideoManifestBase & (
  | { provider: 'file'; objectPath: string }
  | { provider: 'youtube'; videoId: string }
  | { provider: 'bilibili'; videoId: string; page?: number }
)

const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/
const bilibiliIdPattern = /^BV[A-Za-z0-9]{10}$/
const supportedVideoExtensions = new Set(['.mp4', '.webm', '.ogg'])

function publicVideoUrl(baseUrl: string, objectPath: string) {
  const normalizedPath = objectPath.trim().replace(/^\/+/, '')
  if (!normalizedPath || normalizedPath.includes('\\') || /[?#]/.test(normalizedPath)) return null
  const segments = normalizedPath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  const extension = segments.at(-1)?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ''
  if (!supportedVideoExtensions.has(extension)) return null
  return `${baseUrl}/${segments.map(encodeURIComponent).join('/')}`
}

function buildVideo(entry: SopVideoManifestEntry, baseUrl: string | null): SopVideo | null {
  const common = {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    provider: entry.provider,
    version: entry.version,
    chapterId: entry.chapterId,
    workflowIds: entry.workflowIds,
    sortOrder: Number.isFinite(entry.sortOrder) ? Math.trunc(entry.sortOrder || 0) : 0,
    resource: entry.resource,
    pageKeys: entry.pageKeys || [],
  }
  if (!entry.id.trim() || !entry.title.trim() || !entry.chapterId.trim() || entry.workflowIds.length === 0 || !entry.resource.trim()) return null
  if (entry.provider === 'file') {
    if (!baseUrl) return null
    const url = publicVideoUrl(baseUrl, entry.objectPath)
    return url ? { ...common, playbackUrl: url, sourceUrl: url } : null
  }
  if (entry.provider === 'youtube') {
    if (!youtubeIdPattern.test(entry.videoId)) return null
    return {
      ...common,
      playbackUrl: `https://www.youtube-nocookie.com/embed/${entry.videoId}?rel=0&playsinline=1`,
      sourceUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
    }
  }
  if (!bilibiliIdPattern.test(entry.videoId)) return null
  const page = Math.max(1, Math.min(999, Math.trunc(entry.page || 1)))
  return {
    ...common,
    playbackUrl: `https://player.bilibili.com/player.html?bvid=${entry.videoId}&page=${page}&high_quality=1&danmaku=0&autoplay=0`,
    sourceUrl: `https://www.bilibili.com/video/${entry.videoId}?p=${page}`,
  }
}

export function buildSopVideos(
  entries: SopVideoManifestEntry[],
  baseUrl = process.env.SOP_PUBLIC_BASE_URL,
  nodeEnv = process.env.NODE_ENV,
) {
  const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl, nodeEnv)
  return entries.flatMap((entry) => {
    const video = buildVideo(entry, normalizedBaseUrl)
    return video ? [video] : []
  })
}
