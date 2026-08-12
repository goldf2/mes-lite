const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizedOrigin(value: string | null | undefined) {
  if (!value || value === 'null') return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function configuredTrustedOrigins(value = process.env.MES_TRUSTED_ORIGINS) {
  if (!value) return []
  return value.split(',').map((item) => normalizedOrigin(item.trim())).filter((item): item is string => Boolean(item))
}

export function resolveRequestOrigin(input: {
  fallbackOrigin: string
  forwardedHost?: string | null
  forwardedProto?: string | null
}) {
  const host = input.forwardedHost?.split(',')[0]?.trim()
  const protocol = input.forwardedProto?.split(',')[0]?.trim().toLowerCase()
  if (!host || (protocol !== 'http' && protocol !== 'https')) return normalizedOrigin(input.fallbackOrigin) || input.fallbackOrigin
  return normalizedOrigin(`${protocol}://${host}`) || normalizedOrigin(input.fallbackOrigin) || input.fallbackOrigin
}

export function isTrustedWriteRequestOrigin(input: {
  method: string
  requestOrigin: string
  origin: string | null
  trustedOrigins?: readonly string[]
}) {
  if (safeMethods.has(input.method.toUpperCase())) return true
  const origin = normalizedOrigin(input.origin)
  if (!origin) return false
  const allowed = new Set([
    normalizedOrigin(input.requestOrigin),
    ...(input.trustedOrigins || []).map(normalizedOrigin),
  ].filter((item): item is string => Boolean(item)))
  return allowed.has(origin)
}
