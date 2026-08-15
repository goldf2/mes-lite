import { File } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { createAuditLog, type AuditContext } from '@/lib/audit-core'
import { MAX_ATTACHMENT_FILE_SIZE } from '@/lib/attachment-file-types'
import { resolveAttachmentStoragePath } from '@/lib/attachment-storage'
import { prisma } from '@/lib/prisma'
import { uploadManagedAttachment } from '@/modules/attachments/server/attachment-command-service'

export const SYSTEM_SOP_TITLE = 'MES-lite 全流程作业指导书'
export const SYSTEM_SOP_ROOT_CATEGORY = '系统教学'
export const SYSTEM_SOP_CATEGORY = 'SOP'
export const SYSTEM_SOP_MARKER = 'MES_LITE_SYSTEM_SOP'

const manifestFileSchema = z.object({
  format: z.enum(['PDF', 'DOCX']),
  fileName: z.string().trim().min(1).max(255),
  objectPath: z.string().trim().min(1).max(500),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  product: z.literal('MES-lite'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  generatedAt: z.string().datetime(),
  files: z.array(manifestFileSchema).length(2),
}).strict()

type Manifest = z.infer<typeof manifestSchema>
type ManifestFile = z.infer<typeof manifestFileSchema>

export type SopReleaseArtifact = ManifestFile & {
  sourcePath: string
  mimeType: string
}

export type SopReleaseBundle = {
  manifest: Manifest
  manifestPath: string
  releaseRoot: string
  manifestSha256: string
  releaseSha256: string
  artifacts: SopReleaseArtifact[]
}

type PublicationOperator = {
  id: string
  username: string
  name: string
  role: string
}

type PermissionFlags = {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canGrant: boolean
}

export type SopLibraryPublicationPlan = {
  operation: 'CREATE' | 'RESUME' | 'ALREADY_PUBLISHED'
  version: string
  releaseSha256: string
  operator: Omit<PublicationOperator, 'id'>
  categoriesToCreate: string[]
  documentId: string | null
  verifiedFormats: Array<'PDF' | 'DOCX'>
  missingFormats: Array<'PDF' | 'DOCX'>
  documentsToArchive: Array<{ id: string; version: string }>
}

const requiredPermissionFields = [
  { resource: 'documentCategories', field: 'canCreate', label: '文档类别.新增' },
  { resource: 'workInstructions', field: 'canCreate', label: '产品文档.新增' },
  { resource: 'workInstructions', field: 'canUpdate', label: '产品文档.修改' },
  { resource: 'attachments', field: 'canCreate', label: '附件.新增' },
] as const

function sha256(content: Buffer | string) {
  return createHash('sha256').update(content).digest('hex')
}

function expectedFileName(version: string, format: 'PDF' | 'DOCX') {
  return `MES-lite全流程作业指导书-v${version}.${format.toLowerCase()}`
}

function expectedObjectPath(version: string, fileName: string) {
  return `v${version}/${fileName}`
}

function mimeType(format: 'PDF' | 'DOCX') {
  return format === 'PDF'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

function isContainedPath(candidate: string, root: string) {
  const relative = path.relative(root, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function publicationMarker(bundle: SopReleaseBundle) {
  return `${SYSTEM_SOP_MARKER}|version=${bundle.manifest.version}|releaseSha256=${bundle.releaseSha256}`
}

function attachmentNote(bundle: SopReleaseBundle, artifact: SopReleaseArtifact) {
  return `${SYSTEM_SOP_MARKER}|version=${bundle.manifest.version}|format=${artifact.format}|sha256=${artifact.sha256}|objectPath=${artifact.objectPath}`
}

function publicationContent(bundle: SopReleaseBundle) {
  const artifactLines = bundle.artifacts.map((artifact) => (
    `${artifact.format}：${artifact.fileName}；${artifact.size} bytes；SHA-256 ${artifact.sha256}；OSS ${artifact.objectPath}`
  ))
  const lines = [
    'MES-lite 系统教学 SOP 受控副本。',
    `版本：v${bundle.manifest.version}`,
    `成品指纹：${bundle.releaseSha256}`,
    ...artifactLines,
  ]
  return {
    contentText: lines.join('\n'),
    contentJson: JSON.stringify({
      type: 'doc',
      content: lines.map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
    }),
  }
}

function parseManifest(rawManifest: Buffer, expectedVersion: string) {
  let source: unknown
  try {
    source = JSON.parse(rawManifest.toString('utf8'))
  } catch {
    throw new Error('SOP 成品清单无效：JSON 格式错误')
  }
  const parsed = manifestSchema.safeParse(source)
  if (!parsed.success) throw new Error(`SOP 成品清单无效：${parsed.error.issues[0]?.message || '格式错误'}`)
  if (parsed.data.version !== expectedVersion) {
    throw new Error(`SOP 版本 v${parsed.data.version} 与应用版本 v${expectedVersion} 不一致`)
  }
  const filesByFormat = new Map(parsed.data.files.map((file) => [file.format, file]))
  if (filesByFormat.size !== 2 || !filesByFormat.has('PDF') || !filesByFormat.has('DOCX')) {
    throw new Error('SOP 成品清单必须且只能包含 PDF、DOCX 各一份')
  }
  for (const format of ['PDF', 'DOCX'] as const) {
    const file = filesByFormat.get(format)!
    const fileName = expectedFileName(parsed.data.version, format)
    if (file.fileName !== fileName || file.objectPath !== expectedObjectPath(parsed.data.version, fileName)) {
      throw new Error(`${format} 文件名或对象路径不符合精确版本契约`)
    }
    if (file.size > MAX_ATTACHMENT_FILE_SIZE) throw new Error(`${format} 超过站内文档库单文件 50MB 限制`)
  }
  return parsed.data
}

export async function loadSopReleaseBundle(input: {
  manifestPath: string
  releaseRoot?: string
  expectedVersion: string
}): Promise<SopReleaseBundle> {
  const manifestPath = path.resolve(input.manifestPath)
  const rawManifest = await readFile(manifestPath)
  const manifest = parseManifest(rawManifest, input.expectedVersion)
  const filesByFormat = new Map(manifest.files.map((file) => [file.format, file]))

  const releaseRoot = path.resolve(input.releaseRoot || path.join(path.dirname(manifestPath), '..'))
  const realReleaseRoot = await realpath(releaseRoot)
  const artifacts: SopReleaseArtifact[] = []
  for (const format of ['PDF', 'DOCX'] as const) {
    const file = filesByFormat.get(format)!
    const fileName = expectedFileName(manifest.version, format)
    const sourcePath = path.resolve(releaseRoot, ...file.objectPath.split('/'))
    const realSourcePath = await realpath(sourcePath)
    if (!isContainedPath(realSourcePath, realReleaseRoot)) throw new Error(`${format} 文件路径越出 SOP 发布目录`)
    const [fileStat, content] = await Promise.all([stat(realSourcePath), readFile(realSourcePath)])
    if (!fileStat.isFile() || fileStat.size !== file.size) throw new Error(`${format} 文件大小与清单不一致`)
    if (sha256(content) !== file.sha256) throw new Error(`${format} 文件 SHA-256 与清单不一致`)
    artifacts.push({ ...file, sourcePath: realSourcePath, mimeType: mimeType(format) })
  }

  const releaseSha256 = sha256(JSON.stringify({
    version: manifest.version,
    files: artifacts.map(({ format, objectPath, size, sha256: artifactSha256 }) => ({
      format, objectPath, size, sha256: artifactSha256,
    })),
  }))
  return {
    manifest,
    manifestPath,
    releaseRoot: realReleaseRoot,
    manifestSha256: sha256(rawManifest),
    releaseSha256,
    artifacts,
  }
}

function validatedPublicBaseUrl(value: string, environment: string | undefined) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('OSS 公开下载基地址无效')
  }
  const localDevelopmentHttp = environment !== 'production'
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localDevelopmentHttp) throw new Error('OSS 公开下载基地址必须使用 HTTPS')
  if (url.username || url.password || url.search || url.hash) throw new Error('OSS 公开下载基地址不得包含凭据、查询参数或片段')
  return url.toString().replace(/\/+$/, '')
}

function publicObjectUrl(baseUrl: string, objectPath: string) {
  return new URL(`${baseUrl}/${objectPath.split('/').map(encodeURIComponent).join('/')}`)
}

async function readLimitedResponse(response: Response, maximumBytes: number, label: string) {
  if (!response.ok) throw new Error(`${label} 下载失败：HTTP ${response.status}`)
  const declaredLength = Number(response.headers.get('content-length') || '0')
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error(`${label} 超过允许大小`)
  if (!response.body) throw new Error(`${label} 下载响应为空`)
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    total += chunk.length
    if (total > maximumBytes) {
      await reader.cancel()
      throw new Error(`${label} 超过允许大小`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function fetchPublicObject(url: URL, baseOrigin: string, maximumBytes: number, label: string) {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' })
  } catch (error) {
    throw new Error(`${label} 下载失败：${error instanceof Error ? error.message : '网络错误'}`)
  }
  if (new URL(response.url).origin !== baseOrigin) throw new Error(`${label} 下载发生跨域重定向，发布已停止`)
  return readLimitedResponse(response, maximumBytes, label)
}

export async function stageSopReleaseFromOss(input: {
  publicBaseUrl: string
  expectedVersion: string
  destinationRoot: string
  environment?: string
}) {
  const baseUrl = validatedPublicBaseUrl(input.publicBaseUrl, input.environment)
  const baseOrigin = new URL(baseUrl).origin
  const manifestObjectPath = `v${input.expectedVersion}/manifest.json`
  const rawManifest = await fetchPublicObject(
    publicObjectUrl(baseUrl, manifestObjectPath), baseOrigin, 1024 * 1024, 'SOP 版本清单',
  )
  const manifest = parseManifest(rawManifest, input.expectedVersion)
  const destinationRoot = path.resolve(input.destinationRoot)
  const versionDirectory = path.join(destinationRoot, `v${manifest.version}`)
  const latestDirectory = path.join(destinationRoot, 'latest')
  await Promise.all([mkdir(versionDirectory, { recursive: true }), mkdir(latestDirectory, { recursive: true })])
  const manifestPath = path.join(versionDirectory, 'manifest.json')
  await Promise.all([
    writeFile(manifestPath, rawManifest),
    writeFile(path.join(latestDirectory, 'manifest.json'), rawManifest),
  ])
  for (const artifact of manifest.files) {
    const content = await fetchPublicObject(
      publicObjectUrl(baseUrl, artifact.objectPath), baseOrigin, artifact.size, `SOP ${artifact.format}`,
    )
    if (content.length !== artifact.size || sha256(content) !== artifact.sha256) {
      throw new Error(`SOP ${artifact.format} 下载内容与版本清单不一致`)
    }
    await writeFile(path.join(versionDirectory, artifact.fileName), content)
  }
  return loadSopReleaseBundle({ manifestPath, releaseRoot: destinationRoot, expectedVersion: input.expectedVersion })
}

function emptyFlags(): PermissionFlags {
  return { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }
}

function orFlags(target: PermissionFlags, source: PermissionFlags) {
  target.canRead ||= source.canRead
  target.canCreate ||= source.canCreate
  target.canUpdate ||= source.canUpdate
  target.canDelete ||= source.canDelete
  target.canGrant ||= source.canGrant
}

async function requirePublicationOperator(username: string): Promise<PublicationOperator> {
  const operator = await prisma.operator.findUnique({
    where: { username },
    select: { id: true, username: true, name: true, role: true, status: true },
  })
  if (!operator || operator.status !== 'ACTIVE') throw new Error('发布操作人不存在或账号未启用')
  if (operator.role === 'ADMIN') return operator

  const resources = Array.from(new Set(requiredPermissionFields.map((item) => item.resource)))
  const [groupLinks, roleSettings, overrides] = await Promise.all([
    prisma.operatorPermissionGroup.findMany({
      where: { operatorId: operator.id },
      include: { group: { include: { settings: { where: { resource: { in: resources } } } } } },
    }),
    prisma.permissionSetting.findMany({ where: { role: operator.role, resource: { in: resources } } }),
    prisma.operatorPermissionOverride.findMany({
      where: {
        operatorId: operator.id,
        resource: { in: resources },
        OR: [
          { legacyPermanent: true },
          { legacyPermanent: false, startsAt: { lte: new Date() }, expiresAt: { gt: new Date() } },
        ],
      },
    }),
  ])
  const roleByResource = new Map(roleSettings.map((setting) => [setting.resource, setting]))
  const overrideByResource = new Map(overrides.map((override) => [override.resource, override]))
  const effective = new Map<string, PermissionFlags>()

  for (const resource of resources) {
    const flags = emptyFlags()
    if (groupLinks.length === 0) {
      const roleSetting = roleByResource.get(resource)
      if (roleSetting) orFlags(flags, roleSetting)
    } else {
      for (const link of groupLinks) {
        const setting = link.group.settings.find((item) => item.resource === resource)
        if (setting) orFlags(flags, setting)
      }
    }
    const override = overrideByResource.get(resource)
    effective.set(resource, override ? {
      canRead: override.canRead,
      canCreate: override.canCreate,
      canUpdate: override.canUpdate,
      canDelete: override.canDelete,
      canGrant: override.canGrant,
    } : flags)
  }

  const missing = requiredPermissionFields.filter((requirement) => !effective.get(requirement.resource)?.[requirement.field])
  if (missing.length > 0) throw new Error(`发布操作人缺少权限：${missing.map((item) => item.label).join('、')}`)
  return operator
}

async function findPublicationCategories() {
  const roots = await prisma.documentCategory.findMany({
    where: { name: SYSTEM_SOP_ROOT_CATEGORY, parentId: null },
    select: { id: true },
  })
  if (roots.length > 1) throw new Error(`存在多个“${SYSTEM_SOP_ROOT_CATEGORY}”一级类别，请先治理重复数据`)
  const root = roots[0] || null
  const children = root ? await prisma.documentCategory.findMany({
    where: { name: SYSTEM_SOP_CATEGORY, parentId: root.id },
    select: { id: true },
  }) : []
  if (children.length > 1) throw new Error(`存在多个“${SYSTEM_SOP_ROOT_CATEGORY} / ${SYSTEM_SOP_CATEGORY}”类别，请先治理重复数据`)
  return { root, child: children[0] || null }
}

async function inspectDocumentAttachments(documentId: string, bundle: SopReleaseBundle) {
  const attachments = await prisma.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', ownerId: documentId, deletedAt: null },
  })
  const expectedNames = new Set(bundle.artifacts.map((artifact) => artifact.fileName))
  const unexpected = attachments.filter((attachment) => !expectedNames.has(attachment.originalName))
  if (unexpected.length > 0) throw new Error(`受控 SOP 文档存在非清单附件：${unexpected.map((item) => item.originalName).join('、')}`)

  const verifiedFormats: Array<'PDF' | 'DOCX'> = []
  const missingFormats: Array<'PDF' | 'DOCX'> = []
  for (const artifact of bundle.artifacts) {
    const matches = attachments.filter((attachment) => attachment.originalName === artifact.fileName)
    if (matches.length > 1) throw new Error(`${artifact.format} 存在重复附件，请先治理重复数据`)
    const attachment = matches[0]
    if (!attachment) {
      missingFormats.push(artifact.format)
      continue
    }
    if (attachment.size !== artifact.size || attachment.mimeType !== artifact.mimeType || attachment.note !== attachmentNote(bundle, artifact)) {
      throw new Error(`${artifact.format} 附件元数据与成品清单不一致`)
    }
    let content: Buffer
    try {
      content = await readFile(resolveAttachmentStoragePath(attachment.storagePath))
    } catch {
      throw new Error(`${artifact.format} 站内附件文件缺失或路径无效`)
    }
    if (content.length !== artifact.size || sha256(content) !== artifact.sha256) {
      throw new Error(`${artifact.format} 站内附件内容与成品清单不一致`)
    }
    verifiedFormats.push(artifact.format)
  }
  return { verifiedFormats, missingFormats }
}

export async function preflightSopLibraryPublication(input: {
  bundle: SopReleaseBundle
  operatorUsername: string
}): Promise<SopLibraryPublicationPlan> {
  const { bundle } = input
  const operator = await requirePublicationOperator(input.operatorUsername)
  const categories = await findPublicationCategories()
  const documents = await prisma.workInstruction.findMany({
    where: { title: SYSTEM_SOP_TITLE, version: `v${bundle.manifest.version}`, deletedAt: null },
    include: { category: { include: { parent: true } } },
  })
  if (documents.length > 1) throw new Error('同版本受控 SOP 文档存在重复记录，请先治理重复数据')
  const document = documents[0] || null
  let operation: SopLibraryPublicationPlan['operation'] = 'CREATE'
  let attachmentState = {
    verifiedFormats: [] as Array<'PDF' | 'DOCX'>,
    missingFormats: bundle.artifacts.map((artifact) => artifact.format),
  }
  if (document) {
    if (document.category.name !== SYSTEM_SOP_CATEGORY || document.category.parent?.name !== SYSTEM_SOP_ROOT_CATEGORY) {
      throw new Error('同版本同名文档不属于“系统教学 / SOP”，拒绝接管人工文档')
    }
    if (document.note !== publicationMarker(bundle)) throw new Error('同版本同名文档不是本清单创建的受控副本')
    if (!['DRAFT', 'ACTIVE'].includes(document.status)) throw new Error(`同版本受控 SOP 当前状态为 ${document.status}，拒绝自动重启用`)
    attachmentState = await inspectDocumentAttachments(document.id, bundle)
    if (document.status === 'ACTIVE') {
      if (attachmentState.missingFormats.length > 0) throw new Error('已生效受控 SOP 缺少清单附件，必须先恢复数据一致性')
      operation = 'ALREADY_PUBLISHED'
    } else {
      operation = 'RESUME'
    }
  }

  const documentsToArchive = await prisma.workInstruction.findMany({
    where: {
      title: SYSTEM_SOP_TITLE,
      version: { not: `v${bundle.manifest.version}` },
      status: 'ACTIVE',
      note: { startsWith: `${SYSTEM_SOP_MARKER}|` },
      deletedAt: null,
    },
    select: { id: true, version: true },
  })
  return {
    operation,
    version: bundle.manifest.version,
    releaseSha256: bundle.releaseSha256,
    operator: { username: operator.username, name: operator.name, role: operator.role },
    categoriesToCreate: [
      ...(!categories.root ? [SYSTEM_SOP_ROOT_CATEGORY] : []),
      ...(!categories.child ? [`${SYSTEM_SOP_ROOT_CATEGORY} / ${SYSTEM_SOP_CATEGORY}`] : []),
    ],
    documentId: document?.id || null,
    verifiedFormats: attachmentState.verifiedFormats,
    missingFormats: attachmentState.missingFormats,
    documentsToArchive,
  }
}

async function ensurePublicationDraft(bundle: SopReleaseBundle, operator: PublicationOperator, backupReference: string) {
  const auditContext: AuditContext = {
    operatorId: operator.id,
    operatorName: operator.name,
    ipAddress: undefined,
    userAgent: 'MES-lite sop:publish:library',
  }
  return prisma.$transaction(async (tx) => {
    const roots = await tx.documentCategory.findMany({
      where: { name: SYSTEM_SOP_ROOT_CATEGORY, parentId: null },
      orderBy: { id: 'asc' },
    })
    if (roots.length > 1) throw new Error(`存在多个“${SYSTEM_SOP_ROOT_CATEGORY}”一级类别，发布已停止`)
    let root = roots[0]
    if (!root) {
      const last = await tx.documentCategory.findFirst({ where: { parentId: null }, orderBy: { sortOrder: 'desc' } })
      root = await tx.documentCategory.create({
        data: { name: SYSTEM_SOP_ROOT_CATEGORY, parentId: null, sortOrder: (last?.sortOrder || 0) + 10 },
      })
      await createAuditLog(tx, auditContext, {
        action: 'CREATE', entityType: 'DOCUMENT_CATEGORY', entityId: root.id, entityLabel: root.name, afterData: root,
        note: '受控 SOP 发布命令创建一级类别',
      })
    }
    const categories = await tx.documentCategory.findMany({
      where: { name: SYSTEM_SOP_CATEGORY, parentId: root.id },
      orderBy: { id: 'asc' },
    })
    if (categories.length > 1) throw new Error(`存在多个“${SYSTEM_SOP_ROOT_CATEGORY} / ${SYSTEM_SOP_CATEGORY}”类别，发布已停止`)
    let category = categories[0]
    if (!category) {
      const last = await tx.documentCategory.findFirst({ where: { parentId: root.id }, orderBy: { sortOrder: 'desc' } })
      category = await tx.documentCategory.create({
        data: { name: SYSTEM_SOP_CATEGORY, parentId: root.id, sortOrder: (last?.sortOrder || 0) + 10 },
      })
      await createAuditLog(tx, auditContext, {
        action: 'CREATE', entityType: 'DOCUMENT_CATEGORY', entityId: category.id, entityLabel: category.name, afterData: category,
        note: `受控 SOP 发布命令创建“${SYSTEM_SOP_ROOT_CATEGORY} / ${SYSTEM_SOP_CATEGORY}”类别`,
      })
    }

    const existing = await tx.workInstruction.findMany({
      where: { title: SYSTEM_SOP_TITLE, version: `v${bundle.manifest.version}`, deletedAt: null },
    })
    if (existing.length > 1) throw new Error('同版本受控 SOP 文档出现并发重复，发布已停止')
    const content = publicationContent(bundle)
    if (!existing[0]) {
      const document = await tx.workInstruction.create({
        data: {
          categoryId: category.id,
          title: SYSTEM_SOP_TITLE,
          version: `v${bundle.manifest.version}`,
          status: 'DRAFT',
          materialId: null,
          note: publicationMarker(bundle),
          ...content,
        },
      })
      await createAuditLog(tx, auditContext, {
        action: 'CREATE', entityType: 'WORK_INSTRUCTION', entityId: document.id, entityLabel: document.title, afterData: document,
        note: `建立受控 SOP 草稿；附件全部校验通过后才会生效；备份 ${backupReference}`,
      })
      return document
    }

    const current = existing[0]
    if (current.status !== 'DRAFT' || current.note !== publicationMarker(bundle) || current.categoryId !== category.id) {
      throw new Error('同版本受控 SOP 草稿状态或归属已变化，发布已停止')
    }
    if (current.contentJson === content.contentJson && current.contentText === content.contentText) return current
    const updated = await tx.workInstruction.update({
      where: { id: current.id },
      data: { ...content },
    })
    await createAuditLog(tx, auditContext, {
      action: 'PREPARE', entityType: 'WORK_INSTRUCTION', entityId: updated.id, entityLabel: updated.title,
      beforeData: current, afterData: updated, note: '重试受控 SOP 发布并同步清单摘要',
    })
    return updated
  })
}

async function ensureAttachmentPublicationAudits(
  documentId: string,
  bundle: SopReleaseBundle,
  auditContext: AuditContext,
  backupReference: string,
) {
  const attachments = await prisma.documentAttachment.findMany({
    where: { ownerType: 'WORK_INSTRUCTION', ownerId: documentId, deletedAt: null },
  })
  for (const attachment of attachments) {
    const artifact = bundle.artifacts.find((item) => item.fileName === attachment.originalName)
    if (!artifact) throw new Error(`受控 SOP 文档存在非清单附件：${attachment.originalName}`)
    const existingAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'DOCUMENT_ATTACHMENT',
        entityId: attachment.id,
        action: { in: ['CREATE', 'RECONCILE'] },
      },
      select: { id: true },
    })
    if (existingAudit) continue
    await createAuditLog(prisma, auditContext, {
      action: 'RECONCILE', entityType: 'DOCUMENT_ATTACHMENT', entityId: attachment.id,
      entityLabel: attachment.originalName, afterData: attachment,
      note: `受控 SOP 断点续传补记 ${artifact.format} 附件审计；SHA-256 ${artifact.sha256}；备份 ${backupReference}`,
    })
  }
}

export async function applySopLibraryPublication(input: {
  bundle: SopReleaseBundle
  operatorUsername: string
  backupReference: string
}) {
  const backupReference = input.backupReference.trim()
  if (backupReference.length < 3 || backupReference.length > 500) throw new Error('必须提供有效的一致备份编号或清单路径')
  const initialPlan = await preflightSopLibraryPublication(input)
  if (initialPlan.operation === 'ALREADY_PUBLISHED') return { status: 'ALREADY_PUBLISHED' as const, plan: initialPlan }
  const operator = await requirePublicationOperator(input.operatorUsername)
  const document = await ensurePublicationDraft(input.bundle, operator, backupReference)
  let attachmentState = await inspectDocumentAttachments(document.id, input.bundle)
  const auditContext: AuditContext = {
    operatorId: operator.id,
    operatorName: operator.name,
    ipAddress: undefined,
    userAgent: 'MES-lite sop:publish:library',
  }

  for (const format of attachmentState.missingFormats) {
    const artifact = input.bundle.artifacts.find((item) => item.format === format)!
    const content = await readFile(artifact.sourcePath)
    const file = new File([new Uint8Array(content)], artifact.fileName, { type: artifact.mimeType }) as unknown as globalThis.File
    const attachment = await uploadManagedAttachment({
      ownerType: 'WORK_INSTRUCTION',
      ownerId: document.id,
      documentType: 'WORK_INSTRUCTION',
      note: attachmentNote(input.bundle, artifact),
      file,
    }, operator.id)
    await createAuditLog(prisma, auditContext, {
      action: 'CREATE', entityType: 'DOCUMENT_ATTACHMENT', entityId: attachment.id,
      entityLabel: attachment.originalName, afterData: attachment,
      note: `受控 SOP ${artifact.format} 附件；SHA-256 ${artifact.sha256}；备份 ${backupReference}`,
    })
  }

  attachmentState = await inspectDocumentAttachments(document.id, input.bundle)
  if (attachmentState.missingFormats.length > 0 || attachmentState.verifiedFormats.length !== 2) {
    throw new Error('SOP 附件复核未通过，文档保持草稿状态')
  }
  await ensureAttachmentPublicationAudits(document.id, input.bundle, auditContext, backupReference)

  const finalDocument = await prisma.$transaction(async (tx) => {
    const current = await tx.workInstruction.findUnique({ where: { id: document.id } })
    if (!current || current.deletedAt || current.status !== 'DRAFT' || current.note !== publicationMarker(input.bundle)) {
      throw new Error('SOP 草稿在发布期间发生变化，文档保持未生效状态')
    }
    const savedAttachments = await tx.documentAttachment.findMany({
      where: { ownerType: 'WORK_INSTRUCTION', ownerId: current.id, deletedAt: null },
      select: { originalName: true, size: true },
    })
    const expected = new Map(input.bundle.artifacts.map((artifact) => [artifact.fileName, artifact.size]))
    if (savedAttachments.length !== 2 || savedAttachments.some((item) => expected.get(item.originalName) !== item.size)) {
      throw new Error('SOP 附件记录在发布期间发生变化，文档保持未生效状态')
    }
    const olderDocuments = await tx.workInstruction.findMany({
      where: {
        id: { not: current.id },
        title: SYSTEM_SOP_TITLE,
        status: 'ACTIVE',
        note: { startsWith: `${SYSTEM_SOP_MARKER}|` },
        deletedAt: null,
      },
    })
    for (const older of olderDocuments) {
      const archived = await tx.workInstruction.update({ where: { id: older.id }, data: { status: 'ARCHIVED' } })
      await createAuditLog(tx, auditContext, {
        action: 'ARCHIVE', entityType: 'WORK_INSTRUCTION', entityId: archived.id, entityLabel: archived.title,
        beforeData: older, afterData: archived, note: `由 v${input.bundle.manifest.version} 受控 SOP 替代；备份 ${backupReference}`,
      })
    }
    const activated = await tx.workInstruction.update({
      where: { id: current.id },
      data: { status: 'ACTIVE' },
    })
    await createAuditLog(tx, auditContext, {
      action: 'PUBLISH', entityType: 'SYSTEM_SOP', entityId: activated.id, entityLabel: activated.title,
      beforeData: current,
      afterData: {
        document: activated,
        releaseSha256: input.bundle.releaseSha256,
        manifestSha256: input.bundle.manifestSha256,
        files: input.bundle.artifacts.map(({ format, fileName, objectPath, size, sha256: artifactSha256 }) => ({
          format, fileName, objectPath, size, sha256: artifactSha256,
        })),
        archivedDocumentIds: olderDocuments.map((item) => item.id),
      },
      note: `PDF、DOCX、版本、大小与 SHA-256 全部复核通过后生效；备份 ${backupReference}`,
    })
    return activated
  })

  return {
    status: 'PUBLISHED' as const,
    documentId: finalDocument.id,
    version: input.bundle.manifest.version,
    releaseSha256: input.bundle.releaseSha256,
    archivedDocumentIds: initialPlan.documentsToArchive.map((item) => item.id),
  }
}

function valueAfter(args: string[], name: string) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值`)
  return value
}

function printUsage() {
  console.log('用法：npm run sop:publish:library -- --operator <用户名> [本地或 OSS 来源] [--apply --backup-reference <引用>]')
  console.log('本地成品：--manifest <路径>；OSS 成品：--from-oss [--public-base-url <地址>]。')
  console.log('默认仅执行只读预检；确认一致备份后才增加 --apply --backup-reference <备份编号或清单路径>。')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printUsage()
    return
  }
  const knownFlags = new Set([
    '--operator', '--manifest', '--release-root', '--from-oss', '--public-base-url', '--apply', '--backup-reference',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (!knownFlags.has(value)) throw new Error(`未知参数：${value}`)
    if (!['--apply', '--from-oss'].includes(value)) index += 1
  }
  const operatorUsername = valueAfter(args, '--operator')
  if (!operatorUsername) throw new Error('必须使用 --operator 明确指定发布操作人')
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
  const explicitManifest = valueAfter(args, '--manifest')
  const releaseRoot = valueAfter(args, '--release-root')
  const fromOss = args.includes('--from-oss')
  if (fromOss && (explicitManifest || releaseRoot)) throw new Error('--from-oss 不能与 --manifest 或 --release-root 同时使用')
  if (!fromOss && valueAfter(args, '--public-base-url')) throw new Error('--public-base-url 只能与 --from-oss 同时使用')
  let stagingRoot: string | null = null
  try {
    let bundle: SopReleaseBundle
    if (fromOss) {
      stagingRoot = await mkdtemp(path.join(tmpdir(), 'mes-lite-sop-oss-'))
      bundle = await stageSopReleaseFromOss({
        publicBaseUrl: valueAfter(args, '--public-base-url') || process.env.SOP_PUBLIC_BASE_URL || '',
        expectedVersion: packageJson.version,
        destinationRoot: stagingRoot,
        environment: process.env.NODE_ENV,
      })
    } else {
      bundle = await loadSopReleaseBundle({
        manifestPath: path.resolve(explicitManifest || path.join(process.cwd(), 'output/sop-release/latest/manifest.json')),
        releaseRoot,
        expectedVersion: packageJson.version,
      })
    }
    const plan = await preflightSopLibraryPublication({ bundle, operatorUsername })
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'APPLY' : 'PREFLIGHT', source: fromOss ? 'OSS' : 'LOCAL', plan }, null, 2))
    if (!args.includes('--apply')) {
      console.log('只读预检通过；数据库、附件目录和既有文档均未修改。')
      return
    }
    const backupReference = valueAfter(args, '--backup-reference')
    if (!backupReference) throw new Error('--apply 必须同时提供 --backup-reference')
    console.log(JSON.stringify(await applySopLibraryPublication({ bundle, operatorUsername, backupReference }), null, 2))
  } finally {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
