/** Public entry addresses only; no authentication credentials are exposed to clients. */
export function configuredEntryOrigin(value: string | undefined, environment = process.env.NODE_ENV) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const localHttp = environment !== 'production' && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !localHttp)) return undefined
    return url.origin
  } catch { return undefined }
}

export function businessEntryUrls(env: NodeJS.ProcessEnv = process.env) {
  return {
    mesUrl: configuredEntryOrigin(env.APP_ORIGIN || env.MES_PUBLIC_BASE_URL, env.NODE_ENV),
    platformUrl: configuredEntryOrigin(env.PLATFORM_ORIGIN, env.NODE_ENV),
  }
}
