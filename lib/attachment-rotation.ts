export const attachmentRotations = [0, 90, 180, 270] as const

export type AttachmentRotation = (typeof attachmentRotations)[number]

export function isAttachmentRotation(value: number): value is AttachmentRotation {
  return attachmentRotations.includes(value as AttachmentRotation)
}

export function normalizeAttachmentRotation(value: number): AttachmentRotation {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360
  return isAttachmentRotation(normalized) ? normalized : 0
}
