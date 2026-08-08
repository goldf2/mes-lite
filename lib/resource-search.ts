export type ResourceSearchValue = string | number | boolean | Date | null | undefined

export interface ResourceKeywordField<T> {
  key: string
  label: string
  read: (item: T) => ResourceSearchValue | ResourceSearchValue[]
  weight?: number
}

export interface ResourceSearchProfile<T> {
  key: string
  keywordFields: readonly ResourceKeywordField<T>[]
}

export type ResourceSearchFieldType = 'text' | 'number' | 'date' | 'select'
export type ResourceSearchOperator = 'equals' | 'contains' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte'
export interface ResourceSearchOption { value: string; label: string }

export interface ResourceAdvancedSearchField<T> {
  key: string
  label: string
  type: ResourceSearchFieldType
  read: (item: T) => ResourceSearchValue
  options?: readonly ResourceSearchOption[]
  operators?: readonly ResourceSearchOperator[]
}

export interface ResourceSearchCondition {
  id: string
  field: string
  operator: ResourceSearchOperator
  value: string
}

export function defaultResourceSearchOperators(type: ResourceSearchFieldType): readonly ResourceSearchOperator[] {
  if (type === 'number' || type === 'date') return ['equals', 'gt', 'gte', 'lt', 'lte']
  if (type === 'select') return ['equals']
  return ['contains', 'equals', 'startsWith']
}

export function displayAdvancedSearchOptionValue(options: readonly ResourceSearchOption[], value: string) {
  return options.find((option) => option.value === value)?.label || value
}

export function resolveAdvancedSearchOptionInput(options: readonly ResourceSearchOption[], input: string) {
  const normalizedInput = input.trim().toLocaleLowerCase('zh-CN')
  const match = options.find((option) => (
    option.value.toLocaleLowerCase('zh-CN') === normalizedInput
    || option.label.toLocaleLowerCase('zh-CN') === normalizedInput
  ))
  return match?.value || input
}

export function buildAdvancedSearchDraft<T>(
  fields: readonly ResourceAdvancedSearchField<T>[],
  conditions: readonly ResourceSearchCondition[],
) {
  const conditionByField = new Map(conditions.map((condition) => [condition.field, condition]))
  return fields.map((field): ResourceSearchCondition => {
    const existing = conditionByField.get(field.key)
    const operators = field.operators || defaultResourceSearchOperators(field.type)
    return {
      id: existing?.id || `field-${field.key}`,
      field: field.key,
      operator: existing && operators.includes(existing.operator) ? existing.operator : operators[0],
      value: existing?.value || '',
    }
  })
}

function normalizeSearchValue(value: ResourceSearchValue) {
  if (value instanceof Date) return value.toISOString().toLocaleLowerCase('zh-CN')
  return String(value ?? '').trim().toLocaleLowerCase('zh-CN')
}

export function tokenizeKeywordQuery(query: string) {
  const tokens: string[] = []
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(query)) !== null) {
    const token = (match[1] || match[2] || match[3] || '').trim().toLocaleLowerCase('zh-CN')
    if (token && !tokens.includes(token)) tokens.push(token)
  }
  return tokens
}

export function matchesKeywordValues(query: string, values: readonly ResourceSearchValue[]) {
  const tokens = tokenizeKeywordQuery(query)
  if (tokens.length === 0) return true
  const normalizedValues = values.map(normalizeSearchValue)
  return tokens.every((token) => normalizedValues.some((value) => value.includes(token)))
}

export function matchesKeywordQuery<T>(item: T, query: string, profile: ResourceSearchProfile<T>) {
  const tokens = tokenizeKeywordQuery(query)
  if (tokens.length === 0) return true

  const fieldValues = profile.keywordFields.map((field) => {
    const value = field.read(item)
    return (Array.isArray(value) ? value : [value]).map(normalizeSearchValue)
  })

  return tokens.every((token) => fieldValues.some((values) => values.some((value) => value.includes(token))))
}

export function filterByKeywordQuery<T>(items: readonly T[], query: string, profile: ResourceSearchProfile<T>) {
  return items.filter((item) => matchesKeywordQuery(item, query, profile))
}

function conditionMatches<T>(item: T, condition: ResourceSearchCondition, fields: readonly ResourceAdvancedSearchField<T>[]) {
  const field = fields.find((candidate) => candidate.key === condition.field)
  if (!field || !condition.value.trim()) return true
  const actual = field.read(item)
  const expectedText = normalizeSearchValue(condition.value)

  if (field.type === 'number') {
    const actualNumber = Number(actual)
    const expectedNumber = Number(condition.value)
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false
    if (condition.operator === 'gt') return actualNumber > expectedNumber
    if (condition.operator === 'gte') return actualNumber >= expectedNumber
    if (condition.operator === 'lt') return actualNumber < expectedNumber
    if (condition.operator === 'lte') return actualNumber <= expectedNumber
    return actualNumber === expectedNumber
  }

  const actualText = normalizeSearchValue(actual)
  if (condition.operator === 'contains') return actualText.includes(expectedText)
  if (condition.operator === 'startsWith') return actualText.startsWith(expectedText)
  if (condition.operator === 'gt' || condition.operator === 'gte' || condition.operator === 'lt' || condition.operator === 'lte') {
    if (condition.operator === 'gt') return actualText > expectedText
    if (condition.operator === 'gte') return actualText >= expectedText
    if (condition.operator === 'lt') return actualText < expectedText
    return actualText <= expectedText
  }
  return actualText === expectedText
}

export function filterByAdvancedSearch<T>(
  items: readonly T[],
  fields: readonly ResourceAdvancedSearchField<T>[],
  conditions: readonly ResourceSearchCondition[],
) {
  if (conditions.length === 0) return items.slice()
  return items.filter((item) => conditions.every((condition) => conditionMatches(item, condition, fields)))
}

export function filterByResourceSearch<T>(
  items: readonly T[],
  query: string,
  profile: ResourceSearchProfile<T>,
  fields: readonly ResourceAdvancedSearchField<T>[] = [],
  conditions: readonly ResourceSearchCondition[] = [],
) {
  return filterByAdvancedSearch(
    items.filter((item) => matchesKeywordQuery(item, query, profile)),
    fields,
    conditions,
  )
}
