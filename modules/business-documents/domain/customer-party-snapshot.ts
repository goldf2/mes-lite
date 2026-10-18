/** Printable projection of a frozen party snapshot. Never fetch current master data while printing. */
export function readCustomerPartySnapshot(raw?: string | null): { name: string; contact: string; phone: string; address: string } | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    const snapshot = value as Record<string, unknown>
    if (snapshot.schemaVersion !== 'customer-master-snapshot.v1'
      || ['name', 'contact', 'phone', 'address'].some(field => typeof snapshot[field] !== 'string')) throw new Error()
    return { name: snapshot.name as string, contact: snapshot.contact as string, phone: snapshot.phone as string, address: snapshot.address as string }
  } catch { throw new Error('CUSTOMER_MASTER_SNAPSHOT_INVALID') }
}
