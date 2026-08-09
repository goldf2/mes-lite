export const scanSessionInclude = {
  events: { orderBy: { createdAt: 'desc' as const }, take: 30 },
} as const
