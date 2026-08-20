import { prisma } from '@/lib/prisma'
import type { WorkInstructionBatchImportMetadata } from '../contracts/work-instruction-schema'
import { createWorkInstruction } from './work-instruction-command-service'

export const MAX_DOCUMENT_BATCH_FILES = 50

type UploadBatchAttachment = (
  input: { ownerType: string; ownerId: string; documentType: string; file: File },
  uploadedBy: string,
) => Promise<{ id: string }>

export async function batchImportWorkInstructions(
  metadata: WorkInstructionBatchImportMetadata,
  files: File[],
  uploadedBy: string,
  uploadAttachment: UploadBatchAttachment,
) {
  if (files.length === 0) throw new Error('请至少选择一个文件')
  if (files.length > MAX_DOCUMENT_BATCH_FILES) throw new Error(`一次最多导入 ${MAX_DOCUMENT_BATCH_FILES} 个文件`)

  const imported: { instruction: Awaited<ReturnType<typeof createWorkInstruction>>; attachmentId: string }[] = []
  const failed: { fileName: string; error: string }[] = []

  for (const file of files) {
    let instructionId: string | null = null
    try {
      const instruction = await createWorkInstruction({
        ...metadata,
        title: file.name,
        contentJson: null,
      })
      instructionId = instruction.id
      const attachment = await uploadAttachment({
        ownerType: 'WORK_INSTRUCTION',
        ownerId: instruction.id,
        documentType: 'WORK_INSTRUCTION',
        file,
      }, uploadedBy)
      imported.push({ instruction, attachmentId: attachment.id })
    } catch (error) {
      if (instructionId) await prisma.workInstruction.delete({ where: { id: instructionId } }).catch(() => undefined)
      failed.push({ fileName: file.name, error: error instanceof Error ? error.message : '导入失败' })
    }
  }

  return { imported, failed }
}
