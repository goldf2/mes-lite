export interface LabelMediaProfile {
  id: string
  label: string
  widthMm: number
  heightMm: number
}

export const pc310tLabelMediaProfiles: LabelMediaProfile[] = [
  {
    id: '105X70',
    label: '105 × 70 mm',
    widthMm: 105,
    heightMm: 70,
  },
  {
    id: '100X150',
    label: '100 × 150 mm',
    widthMm: 100,
    heightMm: 150,
  },
]

export const pc310tDefaultLabelMedia = pc310tLabelMediaProfiles[0]

export function labelCanvasDots(media: Pick<LabelMediaProfile, 'widthMm' | 'heightMm'>, dotsPerMillimeter = 8) {
  return {
    width: Math.round(media.widthMm * dotsPerMillimeter),
    height: Math.round(media.heightMm * dotsPerMillimeter),
  }
}

export function labelPrintPageStyle(media: Pick<LabelMediaProfile, 'widthMm' | 'heightMm'>) {
  return `@media print { @page { size: ${media.widthMm}mm ${media.heightMm}mm; margin: 0; } }`
}

export const pc310t203Profile = {
  model: 'Honeywell PC310T',
  dpi: 203,
  dotsPerMillimeter: 8,
  connection: 'ETHERNET',
  labelWidthMm: pc310tDefaultLabelMedia.widthMm,
  labelHeightMm: pc310tDefaultLabelMedia.heightMm,
  canvasWidthDots: labelCanvasDots(pc310tDefaultLabelMedia).width,
  canvasHeightDots: labelCanvasDots(pc310tDefaultLabelMedia).height,
} as const
