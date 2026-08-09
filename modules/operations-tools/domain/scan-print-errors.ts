export class ScanPrintServiceError extends Error {
  constructor(message: string, public readonly status: 404 | 409) {
    super(message)
    this.name = 'ScanPrintServiceError'
  }
}
