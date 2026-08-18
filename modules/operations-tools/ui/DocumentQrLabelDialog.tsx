'use client'

import { Printer } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import { createLabelPrintJob } from '../client/scan-print-api'
import { labelPrintPageStyle, pc310tDefaultLabelMedia } from '../model/label-profiles'
import { createClientRequestId } from '../model/scan-print-view'
import DocumentQrLabel, { type DocumentQrLabelData } from './DocumentQrLabel'

export default function DocumentQrLabelDialog({
  referenceType,
  referenceId,
  data,
  onClose,
  onMessage,
}: {
  referenceType: 'SHIPMENT' | 'PACKAGE_DOCUMENT'
  referenceId: string
  data: DocumentQrLabelData
  onClose: () => void
  onMessage: (message: string) => void
}) {
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)
  const submittingRef = useRef(false)
  const labels = useMemo(() => Array.from({ length: copies }, (_, index) => (
    <DocumentQrLabel key={index} data={data} media={pc310tDefaultLabelMedia} />
  )), [copies, data])

  const print = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setPrinting(true)
    try {
      await createLabelPrintJob({
        clientRequestId: createClientRequestId('DOC-QR'),
        templateType: 'DOCUMENT_QR',
        referenceType,
        referenceId,
        copies,
        printerIp: window.localStorage.getItem('mes-lite.scanPrint.pc310tIp') || undefined,
        labelWidthMm: pc310tDefaultLabelMedia.widthMm,
        labelHeightMm: pc310tDefaultLabelMedia.heightMm,
        payload: data,
      })
      const printStyle = document.createElement('style')
      printStyle.dataset.mesLabelMedia = 'true'
      printStyle.textContent = labelPrintPageStyle(pc310tDefaultLabelMedia)
      document.head.appendChild(printStyle)
      document.body.classList.add('printing-shipment-label')
      const cleanup = () => {
        document.body.classList.remove('printing-shipment-label')
        printStyle.remove()
      }
      window.addEventListener('afterprint', cleanup, { once: true })
      window.print()
      window.setTimeout(cleanup, 1000)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '打印单据二维码失败')
    } finally {
      submittingRef.current = false
      setPrinting(false)
    }
  }

  return (
    <>
      <ModalDialog
        title="单据二维码标签"
        description="标签中的二维码对应唯一系统单据，打印前可调整份数。"
        onClose={onClose}
        size="lg"
        footer={(
          <>
            <AppButton variant="secondary" onClick={onClose} disabled={printing}>关闭</AppButton>
            <AppButton onClick={() => void print()} disabled={printing}>
              <Printer className="h-4 w-4" />
              {printing ? '准备打印…' : '打印标签'}
            </AppButton>
          </>
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="text-sm text-gray-700">
            打印份数
            <input
              type="number"
              min="1"
              max="100"
              value={copies}
              onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
              className="mt-1 block w-32 rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <div className="text-xs text-gray-500">{pc310tDefaultLabelMedia.label} · 浏览器打印</div>
        </div>
        <div className="mt-5 overflow-auto rounded-lg border border-gray-200 bg-gray-100 p-4">
          <div className="mx-auto w-fit shadow">{labels[0]}</div>
        </div>
      </ModalDialog>
      <div className="shipment-label-print-root" aria-hidden="true">{labels}</div>
    </>
  )
}
