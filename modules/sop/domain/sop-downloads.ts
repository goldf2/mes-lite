import type { SopDownload } from '../contracts/sop'

export const SOP_PUBLIC_BASE_URL_ENV = 'SOP_PUBLIC_BASE_URL'

const formats = [
  { format: 'PDF', extension: 'pdf', label: '下载 PDF' },
  { format: 'DOCX', extension: 'docx', label: '下载 DOCX' },
] as const

export function normalizePublicBaseUrl(value: string | undefined, nodeEnv = process.env.NODE_ENV) {
  const raw = value?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    const localHttp = nodeEnv !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !localHttp) return null
    if (url.username || url.password || url.search || url.hash) return null
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function buildSopDownloads(
  version: string,
  baseUrl = process.env[SOP_PUBLIC_BASE_URL_ENV],
  nodeEnv = process.env.NODE_ENV,
): SopDownload[] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return []
  const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl, nodeEnv)
  if (!normalizedBaseUrl) return []

  return formats.map(({ format, extension, label }) => {
    const fileName = `MES-lite全流程作业指导书-v${version}.${extension}`
    return {
      format,
      label,
      fileName,
      url: `${normalizedBaseUrl}/v${version}/${encodeURIComponent(fileName)}`,
    }
  })
}
