import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { prepareSopRelease } from './prepare-sop-release.mjs'

function hash(content: Buffer) {
  return createHash('sha256').update(content).digest('hex')
}

async function main() {
  const projectRoot = process.cwd()
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mes-lite-sop-library-'))
  const databasePath = path.join(temporaryRoot, 'verify.db')
  const releaseRoot = path.join(temporaryRoot, 'release')
  const uploadRoot = path.join(temporaryRoot, 'uploads')
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.MES_LITE_UPLOAD_DIR = uploadRoot

  execFileSync(path.join(projectRoot, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, RUST_LOG: 'info' },
    stdio: 'pipe',
  })

  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8')) as { version: string }
  const packageSource = await readFile(path.join(projectRoot, 'package.json'), 'utf8')
  const dockerfile = await readFile(path.join(projectRoot, 'Dockerfile'), 'utf8')
  assert.match(packageSource, /postbuild[^\n]+build:sop-library-publication-cli/)
  assert.match(packageSource, /build:sop-library-publication-cli[^\n]+sop-library-publication\.mjs/)
  assert.match(dockerfile, /\.next\/maintenance\/sop-library-publication\.mjs \.\/scripts\/sop-library-publication\.mjs/)
  const pdfPath = path.join(temporaryRoot, 'source.pdf')
  const docxPath = path.join(temporaryRoot, 'source.docx')
  await Promise.all([
    writeFile(pdfPath, Buffer.from('%PDF-1.4\nMES-lite controlled SOP fixture\n')),
    writeFile(docxPath, Buffer.from('PK\u0003\u0004MES-lite controlled SOP fixture')),
  ])
  const prepared = await prepareSopRelease({
    version: packageJson.version,
    pdfPath,
    docxPath,
    outputDirectory: releaseRoot,
    generatedAt: '2026-08-15T00:00:00.000Z',
  })

  const publication = await import('./sop-library-publication')
  const { prisma } = await import('../lib/prisma')
  const { uploadManagedAttachment } = await import('../modules/attachments/server/attachment-command-service')
  const { resolveAttachmentStoragePath } = await import('../lib/attachment-storage')

  try {
    const bundle = await publication.loadSopReleaseBundle({
      manifestPath: prepared.latestManifestPath,
      expectedVersion: packageJson.version,
    })
    assert.deepEqual(bundle.artifacts.map((item) => item.format), ['PDF', 'DOCX'])
    assert.match(bundle.releaseSha256, /^[a-f0-9]{64}$/)

    const requestedPaths: string[] = []
    const server = createServer(async (request, response) => {
      try {
        const requestPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname)
        requestedPaths.push(requestPath)
        const prefix = '/sop/'
        if (!requestPath.startsWith(prefix)) {
          response.writeHead(404).end()
          return
        }
        const objectPath = requestPath.slice(prefix.length)
        const sourcePath = objectPath === `v${packageJson.version}/manifest.json`
          ? prepared.latestManifestPath
          : path.join(releaseRoot, ...objectPath.split('/'))
        const content = await readFile(sourcePath)
        response.writeHead(200, { 'content-length': content.length })
        response.end(content)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address() as AddressInfo
      const stagedBundle = await publication.stageSopReleaseFromOss({
        publicBaseUrl: `http://127.0.0.1:${address.port}/sop`,
        expectedVersion: packageJson.version,
        destinationRoot: path.join(temporaryRoot, 'oss-stage'),
        environment: 'development',
      })
      assert.equal(stagedBundle.releaseSha256, bundle.releaseSha256)
      assert.deepEqual(requestedPaths, [
        `/sop/v${packageJson.version}/manifest.json`,
        ...bundle.artifacts.map((artifact) => `/sop/${artifact.objectPath}`),
      ], 'OSS 入库必须读取精确版本清单和文件，不得依赖 latest')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
    await assert.rejects(
      () => publication.stageSopReleaseFromOss({
        publicBaseUrl: 'http://downloads.example.com/mes-lite/sop',
        expectedVersion: packageJson.version,
        destinationRoot: path.join(temporaryRoot, 'unsafe-stage'),
        environment: 'production',
      }),
      /必须使用 HTTPS/,
      '生产环境不得从明文 HTTP 下载受控成品',
    )

    const invalidManifestPath = path.join(releaseRoot, 'latest', 'invalid-manifest.json')
    const invalidManifest = JSON.parse(await readFile(prepared.latestManifestPath, 'utf8'))
    invalidManifest.files[0].objectPath = '../outside.pdf'
    await writeFile(invalidManifestPath, `${JSON.stringify(invalidManifest)}\n`)
    await assert.rejects(
      () => publication.loadSopReleaseBundle({ manifestPath: invalidManifestPath, expectedVersion: packageJson.version }),
      /对象路径不符合精确版本契约/,
      '清单不得用上级路径逃逸发布目录',
    )
    await assert.rejects(
      () => publication.loadSopReleaseBundle({ manifestPath: prepared.latestManifestPath, expectedVersion: '9.9.9' }),
      /与应用版本.*不一致/,
      '清单版本必须与应用版本完全一致',
    )

    const suffix = randomUUID().slice(0, 8)
    const documentController = await prisma.operator.create({
      data: { username: `sop-doc-${suffix}`, passwordHash: 'verify-only', name: 'SOP 文控验证', role: 'OPERATOR', status: 'ACTIVE' },
    })
    const inactiveAdmin = await prisma.operator.create({
      data: { username: `sop-disabled-${suffix}`, passwordHash: 'verify-only', name: '停用管理员', role: 'ADMIN', status: 'DISABLED' },
    })
    const unauthorized = await prisma.operator.create({
      data: { username: `sop-none-${suffix}`, passwordHash: 'verify-only', name: '无权账号', role: 'OPERATOR', status: 'ACTIVE' },
    })
    const documentGroup = await prisma.permissionGroup.create({
      data: {
        code: `sop-document-control-${suffix}`,
        name: 'SOP 文控验证组',
        settings: {
          create: [
            { resource: 'documentCategories', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
            { resource: 'workInstructions', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
            { resource: 'attachments', canRead: true, canCreate: true, canUpdate: true, canDelete: true },
          ],
        },
      },
    })
    await prisma.operatorPermissionGroup.create({ data: { operatorId: documentController.id, groupId: documentGroup.id } })

    await assert.rejects(
      () => publication.preflightSopLibraryPublication({ bundle, operatorUsername: inactiveAdmin.username }),
      /不存在或账号未启用/,
      '停用账号不得发布 SOP',
    )
    await assert.rejects(
      () => publication.preflightSopLibraryPublication({ bundle, operatorUsername: unauthorized.username }),
      /缺少权限/,
      '没有文档、类别和附件权限的账号不得发布 SOP',
    )

    const countsBeforePreflight = await Promise.all([
      prisma.documentCategory.count(),
      prisma.workInstruction.count(),
      prisma.documentAttachment.count(),
      prisma.auditLog.count(),
      prisma.permissionSetting.count(),
    ])
    const initialPlan = await publication.preflightSopLibraryPublication({
      bundle,
      operatorUsername: documentController.username,
    })
    const countsAfterPreflight = await Promise.all([
      prisma.documentCategory.count(),
      prisma.workInstruction.count(),
      prisma.documentAttachment.count(),
      prisma.auditLog.count(),
      prisma.permissionSetting.count(),
    ])
    assert.equal(initialPlan.operation, 'CREATE')
    assert.deepEqual(initialPlan.categoriesToCreate, ['系统教学', '系统教学 / SOP'])
    assert.deepEqual(countsAfterPreflight, countsBeforePreflight, '默认预检不得修改业务、审计或权限数据')

    const rootCategory = await prisma.documentCategory.create({ data: { name: publication.SYSTEM_SOP_ROOT_CATEGORY, sortOrder: 10 } })
    const sopCategory = await prisma.documentCategory.create({
      data: { name: publication.SYSTEM_SOP_CATEGORY, parentId: rootCategory.id, sortOrder: 10 },
    })
    const previous = await prisma.workInstruction.create({
      data: {
        categoryId: sopCategory.id,
        title: publication.SYSTEM_SOP_TITLE,
        version: 'v0.1.000',
        status: 'ACTIVE',
        note: `${publication.SYSTEM_SOP_MARKER}|version=0.1.000|releaseSha256=${'0'.repeat(64)}`,
      },
    })
    const draft = await prisma.workInstruction.create({
      data: {
        categoryId: sopCategory.id,
        title: publication.SYSTEM_SOP_TITLE,
        version: `v${packageJson.version}`,
        status: 'DRAFT',
        note: `${publication.SYSTEM_SOP_MARKER}|version=${packageJson.version}|releaseSha256=${bundle.releaseSha256}`,
      },
    })
    const firstArtifact = bundle.artifacts[0]
    const firstContent = await readFile(firstArtifact.sourcePath)
    const firstFile = new File([new Uint8Array(firstContent)], firstArtifact.fileName, {
      type: firstArtifact.mimeType,
    }) as unknown as globalThis.File
    await uploadManagedAttachment({
      ownerType: 'WORK_INSTRUCTION', ownerId: draft.id, documentType: 'WORK_INSTRUCTION',
      note: `${publication.SYSTEM_SOP_MARKER}|version=${packageJson.version}|format=${firstArtifact.format}|sha256=${firstArtifact.sha256}|objectPath=${firstArtifact.objectPath}`,
      file: firstFile,
    }, documentController.id)

    const resumePlan = await publication.preflightSopLibraryPublication({ bundle, operatorUsername: documentController.username })
    assert.equal(resumePlan.operation, 'RESUME')
    assert.deepEqual(resumePlan.verifiedFormats, ['PDF'])
    assert.deepEqual(resumePlan.missingFormats, ['DOCX'])
    assert.deepEqual(resumePlan.documentsToArchive, [{ id: previous.id, version: previous.version }])

    await assert.rejects(
      () => publication.applySopLibraryPublication({ bundle, operatorUsername: documentController.username, backupReference: '' }),
      /必须提供有效的一致备份/,
      '没有一致备份引用时不得进入写入阶段',
    )
    const published = await publication.applySopLibraryPublication({
      bundle, operatorUsername: documentController.username, backupReference: 'verify-temp-backup-manifest.json',
    })
    assert.equal(published.status, 'PUBLISHED')
    const [savedDocument, archivedPrevious, attachments, publishAudit] = await Promise.all([
      prisma.workInstruction.findUniqueOrThrow({ where: { id: draft.id }, include: { category: { include: { parent: true } } } }),
      prisma.workInstruction.findUniqueOrThrow({ where: { id: previous.id } }),
      prisma.documentAttachment.findMany({ where: { ownerType: 'WORK_INSTRUCTION', ownerId: draft.id, deletedAt: null } }),
      prisma.auditLog.findFirst({ where: { entityType: 'SYSTEM_SOP', entityId: draft.id, action: 'PUBLISH' } }),
    ])
    assert.equal(savedDocument.status, 'ACTIVE')
    assert.equal(savedDocument.category.name, 'SOP')
    assert.equal(savedDocument.category.parent?.name, '系统教学')
    assert.match(savedDocument.contentText || '', new RegExp(bundle.releaseSha256))
    assert.equal(archivedPrevious.status, 'ARCHIVED', '新版本生效必须保留并归档旧版，而不是删除')
    assert.equal(attachments.length, 2)
    assert.ok(publishAudit, '最终生效必须留下包含清单与校验值的审计记录')
    assert.equal(await prisma.auditLog.count({
      where: { entityType: 'DOCUMENT_ATTACHMENT', entityId: { in: attachments.map((item) => item.id) } },
    }), 2, '断点续传和本次上传的两份附件都必须具有审计记录')
    for (const artifact of bundle.artifacts) {
      const attachment = attachments.find((item) => item.originalName === artifact.fileName)
      assert.ok(attachment)
      const stored = await readFile(resolveAttachmentStoragePath(attachment.storagePath))
      assert.equal(stored.length, artifact.size)
      assert.equal(hash(stored), artifact.sha256)
    }

    const countsBeforeRetry = await Promise.all([
      prisma.workInstruction.count(), prisma.documentAttachment.count(), prisma.auditLog.count(),
    ])
    const repeated = await publication.applySopLibraryPublication({
      bundle, operatorUsername: documentController.username, backupReference: 'verify-temp-backup-manifest.json',
    })
    const countsAfterRetry = await Promise.all([
      prisma.workInstruction.count(), prisma.documentAttachment.count(), prisma.auditLog.count(),
    ])
    assert.equal(repeated.status, 'ALREADY_PUBLISHED')
    assert.deepEqual(countsAfterRetry, countsBeforeRetry, '相同版本和校验值重复发布必须完全幂等')

    const pdfAttachment = attachments.find((item) => item.mimeType === 'application/pdf')!
    await writeFile(resolveAttachmentStoragePath(pdfAttachment.storagePath), Buffer.from('corrupted'))
    await assert.rejects(
      () => publication.preflightSopLibraryPublication({ bundle, operatorUsername: documentController.username }),
      /附件内容与成品清单不一致/,
      '站内文件被篡改后必须阻断重复发布，不能只相信数据库大小',
    )

    console.log('SOP 文档库发布验证通过：只读预检、OSS 精确版本、路径/哈希、文控权限、备份门禁、草稿续传、原子启用、旧版归档、幂等和冲突阻断均符合约定。')
  } finally {
    await prisma.$disconnect()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
