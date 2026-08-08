export function recognizedText(fields: Record<string, unknown>, key: string) {
  const value = fields[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function recognizedNumber(fields: Record<string, unknown>, key: string) {
  const value = fields[key]
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

export function recognizedDate(fields: Record<string, unknown>, key: string) {
  const value = recognizedText(fields, key)
  const match = value.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

export function recognizedItems(fields: Record<string, unknown>) {
  return Array.isArray(fields.items)
    ? fields.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

export function matchesRecognizedValue(value: string, candidates: Array<string | null | undefined>) {
  const normalized = value.trim().toLocaleLowerCase()
  if (!normalized) return false
  return candidates.some((candidate) => {
    const option = String(candidate || '').trim().toLocaleLowerCase()
    return option === normalized || option.includes(normalized) || normalized.includes(option)
  })
}
