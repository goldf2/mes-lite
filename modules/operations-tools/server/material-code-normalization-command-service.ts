import { prisma } from '@/lib/prisma'
import { applyMaterialCodeNormalization, getMaterialCodeNormalizationPreview } from './material-code-normalization-service'

export async function executeMaterialCodeNormalization() {
  return prisma.$transaction(async (tx) => {
    const preview = await getMaterialCodeNormalizationPreview(tx)
    if (!preview.canExecute) return { blocked: true as const, preview }
    return { blocked: false as const, preview, applied: await applyMaterialCodeNormalization(tx, preview) }
  })
}
