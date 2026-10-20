import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { MAX_ATTACHMENT_FILE_SIZE } from '@/lib/attachment-file-types'
import { attachmentUploadRoot, resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { prisma } from '@/lib/prisma'
import { AttachmentDomainError } from '../domain/attachment-errors'
import {
  attachmentStorageExtension,
  safeAttachmentStorageSegment,
  TASK_RELEASE_ATTACHMENT_DOCUMENT_TYPE,
} from '../domain/attachment-policy'
import {
  requireManagedAttachmentAccessForOperator,
  requireManagedAttachmentOwnerAccessForOperator,
  type AttachmentOperator,
} from './attachment-authorization-service'

export interface TaskReleaseFileReference {
  attachmentId: string
  versionLabel?: string | null
  bomLineId?: string | null
}

export interface TaskReleaseManifestFile {
  attachmentId: string
  sourceAttachmentId: string
  sourceOwnerType: string
  sourceOwnerId: string
  sourceDocumentVersion: string | null
  sourceDocumentUpdatedAt: string | null
  originalName: string
  mimeType: string
  size: number
  rotation: number
  sha256: string
  versionLabel: string | null
  bomLineId: string | null
}

export interface PreparedTaskReleaseFiles {
  manifestFiles: TaskReleaseManifestFile[]
  attachments: Prisma.DocumentAttachmentCreateManyInput[]
  cleanup: () => Promise<void>
}

async function inspectTaskReleaseSource(operator: AttachmentOperator, ref: TaskReleaseFileReference) {
  const { attachment: source } = await requireManagedAttachmentAccessForOperator(operator, ref.attachmentId, 'read')
  if (!Number.isSafeInteger(source.size) || source.size <= 0 || source.size > MAX_ATTACHMENT_FILE_SIZE) {
    throw new AttachmentDomainError('发布资料文件大小无效', 400)
  }
  let bytes: Buffer
  try {
    const sourcePath = resolveAttachmentStoragePath(source.storagePath)
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size !== source.size) {
      throw new AttachmentDomainError('发布资料文件内容与登记大小不一致', 409)
    }
    bytes = await readFile(sourcePath)
  } catch (error) {
    if (error instanceof AttachmentDomainError) throw error
    throw new AttachmentDomainError('发布资料文件不存在或不可读取', 404)
  }
  if (bytes.length !== source.size) {
    throw new AttachmentDomainError('发布资料文件内容与登记大小不一致', 409)
  }
  const sourceDocument = source.ownerType === 'WORK_INSTRUCTION'
    ? await prisma.workInstruction.findFirst({
      where: { id: source.ownerId, deletedAt: null },
      select: { version: true, updatedAt: true },
    })
    : null
  if (source.ownerType === 'WORK_INSTRUCTION' && !sourceDocument) {
    throw new AttachmentDomainError('发布资料所属文档不存在或已归档', 404)
  }
  const manifest: TaskReleaseManifestFile = {
    attachmentId: source.id,
    sourceAttachmentId: source.id,
    sourceOwnerType: source.ownerType,
    sourceOwnerId: source.ownerId,
    sourceDocumentVersion: sourceDocument?.version || null,
    sourceDocumentUpdatedAt: sourceDocument?.updatedAt.toISOString() || null,
    originalName: source.originalName,
    mimeType: source.mimeType,
    size: bytes.length,
    rotation: source.rotation,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    versionLabel: ref.versionLabel?.trim() || null,
    bomLineId: ref.bomLineId || null,
  }
  return { source, bytes, manifest }
}

/** Read and validate the exact source bytes without creating files or rows. */
export async function inspectTaskReleaseFiles(
  operator: AttachmentOperator | null,
  taskId: string,
  refs: TaskReleaseFileReference[],
): Promise<TaskReleaseManifestFile[]> {
  await requireManagedAttachmentOwnerAccessForOperator(operator, 'TASK_COLLABORATION', taskId, 'read')
  if (!operator) throw new AttachmentDomainError('请先登录', 401)
  const files: TaskReleaseManifestFile[] = []
  for (const ref of refs) {
    files.push((await inspectTaskReleaseSource(operator, ref)).manifest)
  }
  return files
}

/**
 * Prepare immutable copies using the common attachment storage. The caller must
 * authorize the publish action and create all returned attachment rows together
 * with the release manifest in its transaction. Call cleanup on transaction
 * failure; after a successful commit the files belong to that release.
 */
export async function prepareTaskReleaseFiles(
  operator: AttachmentOperator | null,
  taskId: string,
  refs: TaskReleaseFileReference[],
): Promise<PreparedTaskReleaseFiles> {
  await requireManagedAttachmentOwnerAccessForOperator(operator, 'TASK_COLLABORATION', taskId, 'read')
  if (!operator) throw new AttachmentDomainError('请先登录', 401)
  const storagePaths: string[] = []
  const cleanup = async () => {
    await Promise.all(storagePaths.map((storagePath) => rm(storagePath, { force: true })))
  }
  const manifestFiles: TaskReleaseManifestFile[] = []
  const attachments: Prisma.DocumentAttachmentCreateManyInput[] = []

  try {
    for (const ref of refs) {
      const { source, bytes, manifest } = await inspectTaskReleaseSource(operator, ref)
      const id = randomUUID()
      const ownerTypeDirectory = 'TASK_COLLABORATION'
      const ownerIdDirectory = safeAttachmentStorageSegment(taskId)
      const directory = path.join(attachmentUploadRoot(), ownerTypeDirectory, ownerIdDirectory)
      const fileName = `release-${id}${attachmentStorageExtension(source.originalName, source.mimeType)}`
      const storagePath = path.join(directory, fileName)
      await mkdir(directory, { recursive: true })
      const handle = await open(storagePath, 'wx')
      storagePaths.push(storagePath)
      try {
        await handle.writeFile(bytes)
      } finally {
        await handle.close()
      }
      manifestFiles.push({
        ...manifest,
        attachmentId: id,
      })
      attachments.push({
        id,
        ownerType: 'TASK_COLLABORATION',
        ownerId: taskId,
        documentType: TASK_RELEASE_ATTACHMENT_DOCUMENT_TYPE,
        originalName: source.originalName,
        fileName,
        mimeType: source.mimeType,
        size: bytes.length,
        url: `/api/attachments/${id}/file`,
        storagePath,
        note: `任务发布资料；来源附件 ${source.id}；SHA-256 ${manifest.sha256}`,
        uploadedBy: operator.id,
        rotation: source.rotation,
      })
    }
    return { manifestFiles, attachments, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
