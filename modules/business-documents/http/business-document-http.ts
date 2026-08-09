import { NextResponse } from 'next/server'
import { BusinessDocumentError } from '../domain/business-document-errors'

export function businessDocumentPdfResponse(pdf: Buffer, filename: string) {
  const encodedFilename = encodeURIComponent(filename)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}

export function businessDocumentHttpError(error: unknown) {
  if (error instanceof BusinessDocumentError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('Generate business document PDF error:', error)
  return NextResponse.json({ error: '生成单据打印文件失败' }, { status: 500 })
}
