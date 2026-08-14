import type { Prisma } from '@prisma/client'
import { postInventoryIssue } from '@/lib/inventory'

export function issueInventoryForBusinessReference(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof postInventoryIssue>[1],
) {
  return postInventoryIssue(tx, input)
}
