export type PdfSectionStart = {
  title: string
  pageNumber: number
}

export type PdfSection = PdfSectionStart & {
  endPageNumber: number
}

export function buildPdfSections(starts: PdfSectionStart[], pageCount: number): PdfSection[] {
  const normalized = starts
    .filter((item) => item.title.trim() && Number.isInteger(item.pageNumber) && item.pageNumber >= 1 && item.pageNumber <= pageCount)
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .filter((item, index, items) => index === 0 || item.pageNumber !== items[index - 1].pageNumber)

  return normalized.map((item, index) => ({
    title: item.title.trim(),
    pageNumber: item.pageNumber,
    endPageNumber: Math.max(item.pageNumber, (normalized[index + 1]?.pageNumber || pageCount + 1) - 1),
  }))
}

export function buildPageFallbackSections(pageCount: number): PdfSection[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    title: `第 ${index + 1} 页`,
    pageNumber: index + 1,
    endPageNumber: index + 1,
  }))
}
