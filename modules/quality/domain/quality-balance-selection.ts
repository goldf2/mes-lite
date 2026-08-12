type QualityBalance = { inventoryStatus: string; stockQty: number }

export function selectPrimaryQualityBalance<T extends QualityBalance>(balances: T[], inspectionStatus?: string): T | undefined {
  const positive = balances.filter((item) => Number(item.stockQty) > 0.000001)
  if (inspectionStatus === 'PENDING') {
    const quarantine = positive.find((item) => item.inventoryStatus === 'QUARANTINE')
    if (quarantine) return quarantine
  }
  return positive.find((item) => item.inventoryStatus !== 'AVAILABLE') || positive[0] || balances[0]
}
