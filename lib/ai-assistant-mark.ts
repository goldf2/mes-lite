export interface AiAssistantMarkLayoutProfile {
  radius: number
  width: number
  offset: number
  angle: number
}

export interface AiAssistantMarkConfig {
  petalCount: number
  petalRadius: number
  petalAspectRatio: number
  petalOffset: number
  petalSizeVariation: number
  petalOpacity: number
  glassStrength: number
  glassThickness: number
  glassTexture: number
  edgeHighlight: number
  petalColors: string[]
  petalLayoutPattern: AiAssistantMarkLayoutProfile[]
  centerSize: number
  centerOpacity: number
  centerGlowSize: number
  centerGlowStrength: number
  centerMode: 'solid' | 'transparent' | 'none'
  centerColor: string
  centerGlowColor: string
  iconScale: number
  rotationEnabled: boolean
  rotationSeconds: number
  breathingEnabled: boolean
  breathingSeconds: number
  breathScale: number
  pointerShift: number
  pressedScale: number
}

export const defaultAiAssistantMarkConfig: AiAssistantMarkConfig = {
  petalCount: 6,
  petalRadius: 22,
  petalAspectRatio: 0.7,
  petalOffset: 9,
  petalSizeVariation: 1,
  petalOpacity: 0.5,
  glassStrength: 2,
  glassThickness: 2,
  glassTexture: 2,
  edgeHighlight: 0.97,
  petalColors: ['#f352b0', '#ff8b77', '#69d3a5', '#1fcfda', '#9685f4', '#7258e5', '#39b7ee', '#3c8feb'],
  petalLayoutPattern: [
    { radius: 1.02, width: 0.96, offset: 0.92, angle: -1 },
    { radius: 0.96, width: 1.05, offset: 1.04, angle: 1.5 },
    { radius: 1.04, width: 0.94, offset: 0.98, angle: -1.5 },
    { radius: 0.98, width: 1.02, offset: 1.08, angle: 1 },
    { radius: 1.06, width: 0.97, offset: 0.94, angle: -0.5 },
    { radius: 0.95, width: 1.06, offset: 1.02, angle: 1.5 },
    { radius: 1.01, width: 0.95, offset: 1.06, angle: -1 },
    { radius: 0.99, width: 1.03, offset: 0.96, angle: 0.5 },
  ],
  centerSize: 5.04,
  centerOpacity: 0.92,
  centerGlowSize: 14,
  centerGlowStrength: 1,
  centerMode: 'solid',
  centerColor: '#e1d6ff',
  centerGlowColor: '#0d061e',
  iconScale: 1,
  rotationEnabled: true,
  rotationSeconds: 48,
  breathingEnabled: true,
  breathingSeconds: 8,
  breathScale: 1.022,
  pointerShift: 3,
  pressedScale: 0.94,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function color(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

export function normalizeAiAssistantMarkConfig(value: unknown): AiAssistantMarkConfig {
  const source = isRecord(value) ? value : {}
  const defaults = defaultAiAssistantMarkConfig
  const sourceColors = Array.isArray(source.petalColors) ? source.petalColors.slice(0, 16) : []
  const petalColors = sourceColors.length >= 2
    ? sourceColors.map((item, index) => color(item, defaults.petalColors[index % defaults.petalColors.length]))
    : [...defaults.petalColors]
  const sourcePattern = Array.isArray(source.petalLayoutPattern) ? source.petalLayoutPattern.slice(0, 16) : []
  const petalLayoutPattern = sourcePattern.length > 0
    ? sourcePattern.map((item, index) => {
      const profile = isRecord(item) ? item : {}
      const fallback = defaults.petalLayoutPattern[index % defaults.petalLayoutPattern.length]
      return {
        radius: boundedNumber(profile.radius, fallback.radius, 0.5, 1.5),
        width: boundedNumber(profile.width, fallback.width, 0.5, 1.5),
        offset: boundedNumber(profile.offset, fallback.offset, 0.5, 1.5),
        angle: boundedNumber(profile.angle, fallback.angle, -20, 20),
      }
    })
    : defaults.petalLayoutPattern.map((item) => ({ ...item }))
  const centerMode = source.centerMode === 'transparent' || source.centerMode === 'none' ? source.centerMode : 'solid'

  return {
    petalCount: Math.round(boundedNumber(source.petalCount, defaults.petalCount, 4, 16)),
    petalRadius: boundedNumber(source.petalRadius, defaults.petalRadius, 10, 32),
    petalAspectRatio: boundedNumber(source.petalAspectRatio, defaults.petalAspectRatio, 0.45, 1),
    petalOffset: boundedNumber(source.petalOffset, defaults.petalOffset, 4, 30),
    petalSizeVariation: boundedNumber(source.petalSizeVariation, defaults.petalSizeVariation, 0, 1.5),
    petalOpacity: boundedNumber(source.petalOpacity, defaults.petalOpacity, 0.08, 0.8),
    glassStrength: boundedNumber(source.glassStrength, defaults.glassStrength, 0, 2),
    glassThickness: boundedNumber(source.glassThickness, defaults.glassThickness, 0, 2),
    glassTexture: boundedNumber(source.glassTexture, defaults.glassTexture, 0, 2),
    edgeHighlight: boundedNumber(source.edgeHighlight, defaults.edgeHighlight, 0, 2),
    petalColors,
    petalLayoutPattern,
    centerSize: boundedNumber(source.centerSize, defaults.centerSize, 2, 18),
    centerOpacity: boundedNumber(source.centerOpacity, defaults.centerOpacity, 0, 1),
    centerGlowSize: boundedNumber(source.centerGlowSize, defaults.centerGlowSize, 4, 44),
    centerGlowStrength: boundedNumber(source.centerGlowStrength, defaults.centerGlowStrength, 0, 2),
    centerMode,
    centerColor: color(source.centerColor, defaults.centerColor),
    centerGlowColor: color(source.centerGlowColor, defaults.centerGlowColor),
    iconScale: boundedNumber(source.iconScale, defaults.iconScale, 0.5, 1.5),
    rotationEnabled: typeof source.rotationEnabled === 'boolean' ? source.rotationEnabled : defaults.rotationEnabled,
    rotationSeconds: boundedNumber(source.rotationSeconds, defaults.rotationSeconds, 4, 80),
    breathingEnabled: typeof source.breathingEnabled === 'boolean' ? source.breathingEnabled : defaults.breathingEnabled,
    breathingSeconds: boundedNumber(source.breathingSeconds, defaults.breathingSeconds, 1.5, 16),
    breathScale: boundedNumber(source.breathScale, defaults.breathScale, 1, 1.12),
    pointerShift: boundedNumber(source.pointerShift, defaults.pointerShift, 0, 16),
    pressedScale: boundedNumber(source.pressedScale, defaults.pressedScale, 0.72, 1),
  }
}

function hexToRgb(hex: string) {
  const value = hex.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

function mixColor(first: string, second: string, amount: number) {
  const a = hexToRgb(first)
  const b = hexToRgb(second)
  const channel = (key: keyof typeof a) => Math.round(a[key] + (b[key] - a[key]) * amount).toString(16).padStart(2, '0')
  return `#${channel('r')}${channel('g')}${channel('b')}`
}

function paletteColor(config: AiAssistantMarkConfig, index: number) {
  const position = index / config.petalCount * config.petalColors.length
  const start = Math.floor(position) % config.petalColors.length
  const end = (start + 1) % config.petalColors.length
  return mixColor(config.petalColors[start], config.petalColors[end], position - Math.floor(position))
}

function petalProfile(config: AiAssistantMarkConfig, index: number) {
  const position = index / config.petalCount * config.petalLayoutPattern.length
  const start = Math.floor(position) % config.petalLayoutPattern.length
  const end = (start + 1) % config.petalLayoutPattern.length
  const amount = position - Math.floor(position)
  const interpolate = (key: keyof AiAssistantMarkLayoutProfile) => (
    config.petalLayoutPattern[start][key]
    + (config.petalLayoutPattern[end][key] - config.petalLayoutPattern[start][key]) * amount
  )
  return { radius: interpolate('radius'), width: interpolate('width'), offset: interpolate('offset'), angle: interpolate('angle') }
}

export function renderAiAssistantMarkSvg(value: unknown, idPrefix = 'mes-ai-mark') {
  const config = normalizeAiAssistantMarkConfig(value)
  const prefix = idPrefix.replace(/[^a-z0-9_-]/gi, '') || 'mes-ai-mark'
  const id = (name: string) => `${prefix}-${name}`
  const gradients: string[] = []
  const masks: string[] = []
  const petals: string[] = []
  const variation = (number: number) => 1 + (number - 1) * config.petalSizeVariation

  for (let index = 0; index < config.petalCount; index += 1) {
    const profile = petalProfile(config, index)
    const radiusX = config.petalRadius * variation(profile.radius)
    const radiusY = radiusX * config.petalAspectRatio * variation(profile.width)
    const offset = config.petalOffset * variation(profile.offset)
    const angle = -90 + index * 360 / config.petalCount + profile.angle * config.petalSizeVariation
    const radians = angle * Math.PI / 180
    const centerX = 50 + Math.cos(radians) * offset
    const centerY = 50 + Math.sin(radians) * offset
    const outerX = centerX + Math.cos(radians) * radiusX
    const outerY = centerY + Math.sin(radians) * radiusX
    const rotation = `rotate(${angle} ${centerX} ${centerY})`
    const startColor = paletteColor(config, index)
    const petalGradient = id(`petal-${index}`)
    const glassGradient = id(`glass-${index}`)
    gradients.push(
      `<linearGradient id="${petalGradient}" gradientUnits="userSpaceOnUse" x1="${outerX}" y1="${outerY}" x2="50" y2="50">`
      + `<stop offset="0%" stop-color="${startColor}" stop-opacity="0.74"/><stop offset="36%" stop-color="${mixColor(startColor, '#ffffff', 0.08)}" stop-opacity="0.86"/>`
      + `<stop offset="72%" stop-color="${mixColor(startColor, '#ffffff', 0.04)}" stop-opacity="0.9"/><stop offset="100%" stop-color="${startColor}" stop-opacity="0.82"/></linearGradient>`,
      `<linearGradient id="${glassGradient}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.82"/>`
      + '<stop offset="16%" stop-color="#ffffff" stop-opacity="0.24"/><stop offset="42%" stop-color="#ffffff" stop-opacity="0"/>'
      + '<stop offset="76%" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0.42"/></linearGradient>',
    )
    masks.push(`<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" transform="${rotation}" fill="#ffffff"/>`)
    petals.push(
      `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" transform="${rotation}" fill="none" stroke="${mixColor(startColor, '#ffffff', 0.22)}" stroke-opacity="${config.glassThickness * 0.09}" stroke-width="${config.glassThickness * 0.8}" filter="url(#${id('soft-edge')})"/>`,
      `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" transform="${rotation}" fill="url(#${petalGradient})" fill-opacity="${config.petalOpacity}" stroke="#ffffff" stroke-opacity="${config.edgeHighlight * 0.045}" stroke-width="${config.edgeHighlight * 0.16}"/>`,
      `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" transform="${rotation}" fill="url(#${glassGradient})" fill-opacity="${config.glassStrength * 0.34}"/>`,
      `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" transform="${rotation}" fill="url(#${id('texture')})" fill-opacity="${config.glassTexture * 0.28}"/>`,
      `<ellipse cx="${centerX}" cy="${centerY}" rx="${Math.max(1, radiusX - config.glassThickness * 0.55)}" ry="${Math.max(1, radiusY - config.glassThickness * 0.55)}" transform="${rotation}" fill="none" stroke="#ffffff" stroke-opacity="${config.edgeHighlight * 0.18 + config.glassThickness * 0.025}" stroke-width="${config.edgeHighlight * 0.18 + config.glassThickness * 0.16}" stroke-linecap="round" stroke-dasharray="17 83" pathLength="100" filter="url(#${id('soft-edge')})"/>`,
    )
  }

  const centerHidden = config.centerMode === 'none'
  const centerTransparent = config.centerMode === 'transparent'
  const compositeMask = centerTransparent ? ` mask="url(#${id('center-cutout-mask')})"` : ''
  const sharedLight = centerHidden ? '' : `<circle cx="50" cy="50" r="${config.centerGlowSize * 1.7}" fill="url(#${id('shared-light')})" mask="url(#${id('petal-mask')})" filter="url(#${id('shared-light-blur')})" style="mix-blend-mode:screen"/>`
  const center = centerHidden ? '' : (
    `<circle cx="50" cy="50" r="${config.centerGlowSize}" fill="url(#${id('center-gradient')})" filter="url(#${id('center-soft-blur')})" style="mix-blend-mode:screen"/>`
    + `<circle cx="50" cy="50" r="${config.centerSize}" fill="${config.centerColor}" fill-opacity="${centerTransparent ? 0 : config.centerOpacity}" filter="url(#${id('center-soft-blur')})"/>`
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style="display:block;width:100%;height:100%;overflow:visible">`
    + `<defs><radialGradient id="${id('center-gradient')}"><stop offset="0%" stop-color="${config.centerColor}" stop-opacity="${Math.min(1, config.centerOpacity * 0.98)}"/>`
    + `<stop offset="30%" stop-color="${mixColor(config.centerColor, config.centerGlowColor, 0.14)}" stop-opacity="${Math.min(1, config.centerOpacity * 0.88)}"/>`
    + `<stop offset="62%" stop-color="${config.centerGlowColor}" stop-opacity="${Math.min(0.42, config.centerGlowStrength * 0.34)}"/><stop offset="100%" stop-color="${config.centerGlowColor}" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${id('shared-light')}" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="28"><stop offset="0%" stop-color="${config.centerGlowColor}" stop-opacity="${Math.min(0.2, config.centerGlowStrength * 0.14)}"/>`
    + `<stop offset="42%" stop-color="${config.centerGlowColor}" stop-opacity="${Math.min(0.17, config.centerGlowStrength * 0.12)}"/><stop offset="78%" stop-color="${config.centerGlowColor}" stop-opacity="${Math.min(0.08, config.centerGlowStrength * 0.045)}"/><stop offset="100%" stop-color="${config.centerGlowColor}" stop-opacity="0"/></radialGradient>`
    + `<pattern id="${id('texture')}" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.6" r="0.38" fill="#ffffff" fill-opacity="0.32"/><circle cx="5.4" cy="3.1" r="0.26" fill="#ffffff" fill-opacity="0.22"/><circle cx="3.2" cy="6" r="0.32" fill="#5b4fcf" fill-opacity="0.12"/></pattern>`
    + `<filter id="${id('soft-edge')}" x="-12%" y="-12%" width="124%" height="124%"><feGaussianBlur stdDeviation="0.32"/></filter><filter id="${id('shared-light-blur')}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.35"/></filter><filter id="${id('center-soft-blur')}" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="0.75"/></filter>`
    + `<radialGradient id="${id('center-cutout')}"><stop offset="0%" stop-color="#000000"/><stop offset="48%" stop-color="#000000"/><stop offset="100%" stop-color="#ffffff"/></radialGradient>`
    + `<mask id="${id('center-cutout-mask')}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#ffffff"/><circle cx="50" cy="50" r="${config.centerSize * 1.8}" fill="url(#${id('center-cutout')})"/></mask>`
    + `<mask id="${id('petal-mask')}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#000000"/>${masks.join('')}</mask>${gradients.join('')}</defs>`
    + `<g style="isolation:isolate"${compositeMask}>${petals.join('')}${sharedLight}</g>${center}</svg>`
}
