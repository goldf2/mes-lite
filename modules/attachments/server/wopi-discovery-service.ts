import { AttachmentDomainError } from '../domain/attachment-errors'

type WopiProofKey = {
  modulus: string
  exponent: string
}

export type WopiDiscovery = {
  actions: Map<string, { view?: string; edit?: string }>
  currentProofKey: WopiProofKey
  oldProofKey: WopiProofKey
}

const discoveryCacheTtlMs = 10 * 60 * 1000
let cachedDiscovery: { value: WopiDiscovery; expiresAt: number } | null = null

function decodeXmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function attributesOf(tag: string) {
  const attributes: Record<string, string> = {}
  const expression = /([\w:-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = expression.exec(tag))) {
    attributes[match[1]] = decodeXmlAttribute(match[2])
  }
  return attributes
}

function configuredDiscoveryUrl() {
  const explicit = process.env.COLLABORA_DISCOVERY_URL?.trim()
  if (explicit) return explicit
  const publicUrl = process.env.COLLABORA_PUBLIC_URL?.trim()
  if (!publicUrl) throw new AttachmentDomainError('在线表格查看服务未配置', 503)
  return new URL('/hosting/discovery', publicUrl).toString()
}

function requireAllowedDiscoveryUrl(value: string) {
  const url = new URL(value)
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new AttachmentDomainError('在线表格查看服务必须使用 HTTPS', 503)
  }
  return url
}

export function parseWopiDiscovery(xml: string): WopiDiscovery {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new AttachmentDomainError('在线表格查看服务返回了不安全的发现文档', 503)
  }

  const actions = new Map<string, { view?: string; edit?: string }>()
  for (const tag of xml.match(/<action\b[^>]*>/gi) || []) {
    const attributes = attributesOf(tag)
    const extension = attributes.ext?.trim().toLowerCase()
    const name = attributes.name?.trim().toLowerCase()
    const url = attributes.urlsrc?.trim()
    if (!extension || !url || (name !== 'view' && name !== 'edit')) continue
    actions.set(extension, { ...actions.get(extension), [name]: url })
  }

  const proofTag = xml.match(/<proof-key\b[^>]*>/i)?.[0]
  const proof = proofTag ? attributesOf(proofTag) : {}
  if (!proof.modulus || !proof.exponent || !proof.oldmodulus || !proof.oldexponent) {
    throw new AttachmentDomainError('在线表格查看服务未提供 WOPI 请求签名公钥', 503)
  }

  return {
    actions,
    currentProofKey: { modulus: proof.modulus, exponent: proof.exponent },
    oldProofKey: { modulus: proof.oldmodulus, exponent: proof.oldexponent },
  }
}

export async function loadWopiDiscovery(forceRefresh = false) {
  if (!forceRefresh && cachedDiscovery && cachedDiscovery.expiresAt > Date.now()) {
    return cachedDiscovery.value
  }

  const discoveryUrl = requireAllowedDiscoveryUrl(configuredDiscoveryUrl())
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(discoveryUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const discovery = parseWopiDiscovery(await response.text())
    cachedDiscovery = { value: discovery, expiresAt: Date.now() + discoveryCacheTtlMs }
    return discovery
  } catch (error) {
    console.error('Load Collabora discovery error:', error)
    throw new AttachmentDomainError('在线表格查看服务暂不可用', 503)
  } finally {
    clearTimeout(timeout)
  }
}

export function normalizeWopiActionUrl(value: string) {
  // Collabora discovery can include optional WOPI placeholders such as
  // <ui=UI_LLCC&>. MES-lite does not provide those values, so omit them
  // instead of letting URLSearchParams percent-encode the template itself.
  return new URL(value.replace(/<[^>]{1,200}>/g, ''))
}

export async function resolveWopiActionUrl(extension: string) {
  const discovery = await loadWopiDiscovery()
  const action = discovery.actions.get(extension.replace(/^\./, '').toLowerCase())
  const value = action?.view || action?.edit
  if (!value) throw new AttachmentDomainError(`在线表格查看服务不支持 ${extension.toUpperCase()} 文件`, 503)

  const actionUrl = normalizeWopiActionUrl(value)
  const publicUrl = process.env.COLLABORA_PUBLIC_URL?.trim()
  if (publicUrl && actionUrl.origin !== new URL(publicUrl).origin) {
    throw new AttachmentDomainError('在线表格查看服务返回了非预期地址', 503)
  }
  return actionUrl
}
