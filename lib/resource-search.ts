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
  read: (item: T) => ResourceSearchValue | ResourceSearchValue[]
  options?: readonly ResourceSearchOption[]
  operators?: readonly ResourceSearchOperator[]
}

export interface ResourceSearchField<T> extends ResourceAdvancedSearchField<T> {
  keyword?: boolean
  advanced?: boolean
  weight?: number
}

export interface ResourceSearchCatalog<T> {
  key: string
  fields: readonly ResourceSearchField<T>[]
}

export function defineResourceSearchCatalog<T>(key: string, fields: readonly ResourceSearchField<T>[]): ResourceSearchCatalog<T> {
  return { key, fields }
}

export function resourceKeywordProfile<T>(catalog: ResourceSearchCatalog<T>): ResourceSearchProfile<T> {
  return {
    key: catalog.key,
    keywordFields: catalog.fields.filter((field) => field.keyword !== false).map((field) => ({
      key: field.key,
      label: field.label,
      read: field.read,
      weight: field.weight,
    })),
  }
}

export function resourceAdvancedFields<T>(catalog: ResourceSearchCatalog<T>): readonly ResourceAdvancedSearchField<T>[] {
  return catalog.fields.filter((field) => field.advanced !== false)
}

export interface ResourceSearchCondition {
  id: string
  field: string
  operator: ResourceSearchOperator
  value: string
}

const resourceSearchOperatorValues: readonly ResourceSearchOperator[] = ['equals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte']

export function parseResourceSearchConditions(raw: string | null | undefined, allowedFields: readonly string[]) {
  if (!raw) return { conditions: [] as ResourceSearchCondition[] }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length > 30) return { error: '高级搜索条件无效' }
    const allowed = new Set(allowedFields)
    const conditions: ResourceSearchCondition[] = []
    for (let index = 0; index < parsed.length; index += 1) {
      const value = parsed[index]
      if (!value || typeof value !== 'object') return { error: '高级搜索条件无效' }
      const field = String(value.field || '')
      const operator = String(value.operator || '') as ResourceSearchOperator
      const conditionValue = String(value.value || '').trim()
      if (!allowed.has(field) || !resourceSearchOperatorValues.includes(operator) || !conditionValue || conditionValue.length > 200) {
        return { error: '高级搜索条件无效' }
      }
      conditions.push({ id: `query-${field}-${index}`, field, operator, value: conditionValue })
    }
    return { conditions }
  } catch {
    return { error: '高级搜索条件格式错误' }
  }
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
  const actualValues: ResourceSearchValue[] = Array.isArray(actual) ? actual : [actual]
  const expectedText = normalizeSearchValue(condition.value)

  if (field.type === 'number') {
    const expectedNumber = Number(condition.value)
    if (!Number.isFinite(expectedNumber)) return false
    return actualValues.some((actual) => {
      const actualNumber = Number(actual)
      if (!Number.isFinite(actualNumber)) return false
      if (condition.operator === 'gt') return actualNumber > expectedNumber
      if (condition.operator === 'gte') return actualNumber >= expectedNumber
      if (condition.operator === 'lt') return actualNumber < expectedNumber
      if (condition.operator === 'lte') return actualNumber <= expectedNumber
      return actualNumber === expectedNumber
    })
  }

  return actualValues.some((actual) => {
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
  })
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

export function filterBySearchCatalog<T>(
  items: readonly T[],
  query: string,
  catalog: ResourceSearchCatalog<T>,
  conditions: readonly ResourceSearchCondition[] = [],
) {
  return filterByResourceSearch(items, query, resourceKeywordProfile(catalog), resourceAdvancedFields(catalog), conditions)
}
