export const honeywell1900Profile = {
  model: 'Honeywell Xenon 1900',
  inputMode: 'USB HID Keyboard',
  terminator: 'Enter',
} as const

export function cleanScannerValue(value: string) {
  return value.trim().replace(/[\r\n\t]/g, '')
}

export function scannerSubmitKey(key: string) {
  return key === 'Enter' || key === 'Tab'
}
