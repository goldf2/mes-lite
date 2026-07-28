import { randomUUID } from 'crypto'

export function createInternalCode(prefix: string) {
  return `${prefix}_${randomUUID()}`
}
