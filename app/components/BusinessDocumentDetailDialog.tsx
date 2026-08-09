'use client'

import { ReactNode } from 'react'
import AttachmentPanel from './AttachmentPanel'
import ModalDialog from './ModalDialog'

export default function BusinessDocumentDetailDialog({
  title,
  description,
  ownerType,
  ownerId,
  onClose,
  onMessage,
  headerActions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  ownerType: string
  ownerId: string
  onClose: () => void
  onMessage: (message: string) => void
  headerActions?: ReactNode
  children: ReactNode
}) {
  return (
    <ModalDialog
      title={title}
      description={description}
      headerActions={headerActions}
      onClose={onClose}
      size="wide"
      bodyClassName="space-y-6"
    >
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">系统生成单据</span>
          <span className="text-xs text-gray-500">业务数据由系统维护，上传文件统一归入附件管理。</span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 sm:p-5">
          {children}
        </div>
      </section>

      <section className="border-t border-gray-100 pt-5">
        <AttachmentPanel
          ownerType={ownerType}
          ownerId={ownerId}
          title="附件管理"
          enableAiRecognition
          onMessage={onMessage}
        />
      </section>
    </ModalDialog>
  )
}
