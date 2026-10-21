'use client'

import { Printer } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import ModalDialog from '@/app/components/ModalDialog'
import FormField, { appSelectClassName } from '@/app/components/FormField'
import { createLabelPrintJob } from '../client/scan-print-api'
import { labelPrintPageStyle, pc310tDefaultLabelMedia, pc310tLabelMediaProfiles } from '../model/label-profiles'
import { createClientRequestId } from '../model/scan-print-view'
import DocumentQrLabel, { type DocumentQrLabelData } from './DocumentQrLabel'

export interface DocumentQrLabelTarget {
  referenceType: 'SHIPMENT' | 'PACKAGE_DOCUMENT'
  referenceId: string
  data: DocumentQrLabelData
}

type LabelDialogProps = (DocumentQrLabelTarget & { targets?: never } | { targets: DocumentQrLabelTarget[]; referenceType?: never; referenceId?: never; data?: never }) & {
  onClose: () => void
  onMessage: (message: string) => void
}

function labelOverflows(sheet: HTMLElement) {
  if (sheet.scrollHeight > sheet.clientHeight + 1 || sheet.scrollWidth > sheet.clientWidth + 1) return true
  const bounds = sheet.getBoundingClientRect()
  return Array.from(sheet.querySelectorAll('dt, dd')).some((field) => {
    const element = field as HTMLElement
    const rect = element.getBoundingClientRect()
    return element.scrollWidth > element.clientWidth + 1 || rect.bottom > bounds.bottom - 3 || rect.right > bounds.right - 3
  })
}

function overflowInPrintRoot(root: HTMLDivElement | null) {
  if (!root) return false
  const previousStyle = root.style.cssText
  root.style.cssText = 'display:block;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;'
  try {
    return Array.from(root.children).some((child) => child.getAttribute('data-packing-label') === 'true' && labelOverflows(child as HTMLElement))
  } finally { root.style.cssText = previousStyle }
}

export default function DocumentQrLabelDialog(props: LabelDialogProps) {
  const { onClose, onMessage } = props
  const targets = useMemo(() => props.targets || [{ referenceType: props.referenceType!, referenceId: props.referenceId!, data: props.data! }], [props.targets, props.referenceType, props.referenceId, props.data])
  const [mounted, setMounted] = useState(false)
  const [copies, setCopies] = useState(1)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [mediaId, setMediaId] = useState(pc310tDefaultLabelMedia.id)
  const media = pc310tLabelMediaProfiles.find((profile) => profile.id === mediaId) || pc310tDefaultLabelMedia
  const printRootRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [printing, setPrinting] = useState(false)
  const submittingRef = useRef(false)
  const maximumCopies = Math.max(1, Math.floor(100 / Math.max(1, targets.length)))
  const totalLabels = copies * targets.length
  const packing = targets.some((target) => target.data.layout === 'packing')
  const labels = useMemo(() => targets.flatMap((target, targetIndex) => Array.from({ length: copies }, (_, index) => (
    <DocumentQrLabel key={`${targetIndex}:${index}`} data={target.data} media={media} />
  ))), [copies, targets, media])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    let active = true
    void document.fonts.ready.then(() => { if (active) setOverflow(overflowInPrintRoot(printRootRef.current)) })
    return () => { active = false }
  }, [targets, media, copies, mounted])

  const print = async () => {
    if (overflow) return onMessage('标签内容超出所选纸张，请选择更大的标签纸或核对内容长度')
    if (!targets.length || totalLabels > 100) return onMessage('每次最多打印 100 张标签，请减少货箱或份数')
    if (submittingRef.current) return
    submittingRef.current = true
    setPrinting(true)
    try {
      await document.fonts.ready
      const deadline = Date.now() + 15_000
      let qrImages: HTMLImageElement[] = []
      while (Date.now() < deadline) {
        qrImages = Array.from(printRootRef.current?.querySelectorAll('img') || [])
        if (qrImages.length === totalLabels && qrImages.every((image) => image.complete && image.naturalWidth > 0)) break
        await new Promise((resolve) => window.setTimeout(resolve, 50))
      }
      if (qrImages.length !== totalLabels || qrImages.some((image) => !image.complete || !image.naturalWidth)) throw new Error('二维码尚未准备完成，请稍后重试')
      await Promise.all(qrImages.map((image) => image.decode()))
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      if (overflowInPrintRoot(printRootRef.current)) {
        setOverflow(true)
        throw new Error('标签内容超过当前纸张，请选择更大的标签尺寸后打印')
      }
      for (const target of targets) await createLabelPrintJob({
        clientRequestId: createClientRequestId('DOC-QR'),
        templateType: 'DOCUMENT_QR',
        referenceType: target.referenceType,
        referenceId: target.referenceId,
        copies,
        printerIp: window.localStorage.getItem('mes-lite.scanPrint.pc310tIp') || undefined,
        labelWidthMm: media.widthMm,
        labelHeightMm: media.heightMm,
        payload: target.data,
      })
      const printStyle = document.createElement('style')
      printStyle.dataset.mesLabelMedia = 'true'
      printStyle.textContent = labelPrintPageStyle(media)
      document.head.appendChild(printStyle)
      document.body.classList.add('printing-shipment-label', 'printing-document-qr-label')
      const cleanup = () => {
        document.body.classList.remove('printing-shipment-label', 'printing-document-qr-label')
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

  return <>
    <ModalDialog title={packing ? '货箱标签打印 / 补打' : '单据二维码标签'} description={packing ? `共 ${targets.length} 个货箱，各自使用本箱内容和二维码；补打保留相同装箱编号。` : '标签中的二维码对应唯一系统单据，打印前可调整份数。'} onClose={onClose} closeDisabled={printing} size="lg" footer={<><AppButton variant="secondary" onClick={onClose} disabled={printing}>关闭</AppButton><AppButton onClick={() => void print()} disabled={printing || overflow || !targets.length || totalLabels > 100}><Printer className="h-4 w-4" />{printing ? '准备打印…' : `打印标签${targets.length > 1 ? `（${totalLabels} 张）` : ''}`}</AppButton></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={targets.length > 1 ? '每箱打印份数' : '打印份数'}><input type="number" min="1" max={maximumCopies} value={copies} disabled={printing} onChange={(event) => setCopies(Math.min(maximumCopies, Math.max(1, Number(event.target.value) || 1)))} className={appSelectClassName} /></FormField>
        <FormField label="标签纸尺寸"><select value={mediaId} className={appSelectClassName} disabled={printing} onChange={(event) => setMediaId(event.target.value)}>{pc310tLabelMediaProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></FormField>
        {targets.length > 1 && <FormField label="预览货箱"><select value={Math.min(previewIndex, targets.length - 1)} onChange={(event) => setPreviewIndex(Number(event.target.value))} className={appSelectClassName}>{targets.map((target, index) => <option key={target.referenceId} value={index}>{target.data.code}</option>)}</select></FormField>}
      </div>
      {overflow && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">部分标签内容超过当前纸张，请选择更大的标签尺寸后打印。</div>}
      <div className="mt-5 overflow-auto rounded-lg border border-gray-200 bg-gray-100 p-4"><div className="mx-auto w-fit shadow">{targets.length > 0 && <DocumentQrLabel data={targets[Math.min(previewIndex, targets.length - 1)].data} media={media} />}</div></div>
    </ModalDialog>
    {mounted && createPortal(<div ref={printRootRef} className="shipment-label-print-root document-qr-label-print-root" aria-hidden="true">{labels}</div>, document.body)}
  </>
}
