export class WarehousePackageError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}

export function warehousePackageCode(raw: string) {
  let code = raw.trim()
  try { const url = new URL(code); code = url.searchParams.get('code') || code } catch { /* A printed box number is also accepted. */ }
  const match = /^(BX-[A-Za-z0-9-]+)(?:#v([1-9]\d*))?$/.exec(code)
  return match ? { packageNo: match[1], contentVersion: match[2] ? Number(match[2]) : null } : null
}

export function packagePersonnel(value: string | null) {
  if (!value) return []
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [] } catch { return [] }
}
