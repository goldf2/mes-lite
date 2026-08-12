export type BomStatusFilter = 'NONE' | 'NO_ACTIVE' | 'NO_DEFAULT' | 'READY'

export function getBomStatusRelationFilters(status?: string | null): Record<string, unknown>[] {
  if (status === 'NONE') return [{ bomOutputs: { none: {} } }]
  if (status === 'NO_ACTIVE') {
    return [
      { bomOutputs: { some: {} } },
      { bomOutputs: { none: { bom: { status: 'RELEASED' } } } },
    ]
  }
  if (status === 'NO_DEFAULT') {
    return [
      { bomOutputs: { some: { bom: { status: 'RELEASED' } } } },
      { bomOutputs: { none: { bom: { status: 'RELEASED', isDefault: true } } } },
    ]
  }
  if (status === 'READY') {
    return [{ bomOutputs: { some: { bom: { status: 'RELEASED', isDefault: true } } } }]
  }
  return []
}
