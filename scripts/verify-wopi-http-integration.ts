import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { buildWopiProofExpectedValue } from '../modules/attachments/server/wopi-proof-service'

const root = process.cwd()
const dotNetEpochTicks = BigInt('621355968000000000')

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function discoveryKey() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = pair.publicKey.export({ format: 'jwk' })
  if (!jwk.n || !jwk.e) throw new Error('测试 RSA 公钥无效')
  return {
    privateKey: pair.privateKey,
    modulus: Buffer.from(jwk.n, 'base64url').toString('base64'),
    exponent: Buffer.from(jwk.e, 'base64url').toString('base64'),
  }
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('无法取得测试端口')
  return address.port
}

async function freePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

async function waitForServer(origin: string, child: ChildProcess) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 45_000) {
    if (child.exitCode !== null) throw new Error(`Next.js 测试服务提前退出：${child.exitCode}`)
    try {
      const response = await fetch(`${origin}/api/health/live`)
      if (response.ok) return
    } catch {
      // 服务仍在启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('等待 Next.js 测试服务超时')
}

function proofHeaders(privateKey: ReturnType<typeof discoveryKey>['privateKey'], token: string, url: string) {
  const timestamp = dotNetEpochTicks + BigInt(Date.now()) * BigInt(10000)
  const expected = buildWopiProofExpectedValue(token, url, timestamp)
  return {
    'X-WOPI-TimeStamp': timestamp.toString(),
    'X-WOPI-Proof': sign('RSA-SHA256', expected, privateKey).toString('base64'),
  }
}

async function main() {
  const verifyRoot = await mkdtemp(join(tmpdir(), 'mes-lite-wopi-http-'))
  const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
  const uploadRoot = join(verifyRoot, 'uploads')
  const currentKey = discoveryKey()
  const oldKey = discoveryKey()
  let nextProcess: ChildProcess | null = null
  let discoveryServer: Server | null = null
  let prisma: PrismaClient | null = null

  try {
    execFileSync(join(root, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
      stdio: 'pipe',
    })
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    await mkdir(uploadRoot, { recursive: true })
    const operator = await prisma.operator.create({ data: {
      username: 'wopi-admin', passwordHash: 'verification-only', name: 'WOPI 验证员', role: 'ADMIN', status: 'ACTIVE',
    } })
    const material = await prisma.material.create({ data: { code: 'WOPI-MAT-001', name: 'WOPI 验证物料', unit: '件' } })
    const sourcePath = join(uploadRoot, 'verification.xlsx')
    const sourceBytes = Buffer.from('synthetic-xlsx-verification')
    await writeFile(sourcePath, sourceBytes)
    const attachment = await prisma.documentAttachment.create({ data: {
      ownerType: 'MATERIAL', ownerId: material.id, documentType: 'ORIGINAL',
      originalName: '多工作表验证.xlsx', fileName: 'verification.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: sourceBytes.length, url: '/uploads/verification.xlsx', storagePath: sourcePath,
      uploadedBy: operator.id,
    } })
    const browserToken = randomBytes(32).toString('hex')
    await prisma.operatorSession.create({ data: {
      tokenHash: hashToken(browserToken), operatorId: operator.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } })

    discoveryServer = createServer((request, response) => {
      if (request.url !== '/hosting/discovery') {
        response.writeHead(404).end()
        return
      }
      const address = discoveryServer?.address()
      if (!address || typeof address === 'string') throw new Error('发现服务地址无效')
      const origin = `http://127.0.0.1:${address.port}`
      response.setHeader('Content-Type', 'application/xml')
      response.end(`<?xml version="1.0"?><wopi-discovery><net-zone name="external-http"><app name="calc"><action name="edit" ext="xlsx" urlsrc="${origin}/browser/hash/cool.html?" /></app></net-zone><proof-key modulus="${currentKey.modulus}" exponent="${currentKey.exponent}" oldmodulus="${oldKey.modulus}" oldexponent="${oldKey.exponent}" /></wopi-discovery>`)
    })
    const discoveryPort = await listen(discoveryServer)
    const nextPort = await freePort()
    const mesOrigin = `http://127.0.0.1:${nextPort}`
    const collaboraOrigin = `http://127.0.0.1:${discoveryPort}`
    nextProcess = spawn(join(root, 'node_modules', '.bin', 'next'), ['dev', '--port', String(nextPort)], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: databaseUrl,
        MES_LITE_UPLOAD_DIR: uploadRoot,
        MES_PUBLIC_BASE_URL: mesOrigin,
        COLLABORA_PUBLIC_URL: collaboraOrigin,
        COLLABORA_DISCOVERY_URL: `${collaboraOrigin}/hosting/discovery`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let nextOutput = ''
    nextProcess.stdout?.on('data', (chunk) => { nextOutput = `${nextOutput}${chunk}`.slice(-8000) })
    nextProcess.stderr?.on('data', (chunk) => { nextOutput = `${nextOutput}${chunk}`.slice(-8000) })
    try {
      await waitForServer(mesOrigin, nextProcess)
    } catch (error) {
      throw new Error(`${(error as Error).message}\n${nextOutput}`)
    }

    const cookie = `mes_lite_session=${browserToken}`
    const sessionResponse = await fetch(`${mesOrigin}/api/attachments/${attachment.id}/office-view-session`, {
      method: 'POST', headers: { Cookie: cookie, Origin: mesOrigin },
    })
    const sessionBody = await sessionResponse.json() as { data?: {
      id: string; formActionUrl: string; accessToken: string; accessTokenTtl: number
    }; error?: string }
    assert.equal(sessionResponse.status, 200, sessionBody.error)
    assert.ok(sessionBody.data?.formActionUrl.startsWith(`${collaboraOrigin}/browser/hash/cool.html?`))
    assert.ok(sessionBody.data?.formActionUrl.includes('WOPISrc='))
    const wopiToken = sessionBody.data!.accessToken
    const checkUrl = `${mesOrigin}/api/wopi/files/${attachment.id}?access_token=${encodeURIComponent(wopiToken)}`
    const checkResponse = await fetch(checkUrl, { headers: proofHeaders(currentKey.privateKey, wopiToken, checkUrl) })
    const checkBody = await checkResponse.json()
    assert.equal(checkResponse.status, 200, JSON.stringify(checkBody))
    assert.equal(checkBody.BaseFileName, attachment.originalName)
    assert.equal(checkBody.ReadOnly, true)
    assert.equal(checkBody.UserCanWrite, false)

    const contentsUrl = `${mesOrigin}/api/wopi/files/${attachment.id}/contents?access_token=${encodeURIComponent(wopiToken)}`
    const contentsResponse = await fetch(contentsUrl, { headers: proofHeaders(currentKey.privateKey, wopiToken, contentsUrl) })
    assert.equal(contentsResponse.status, 200)
    assert.deepEqual(Buffer.from(await contentsResponse.arrayBuffer()), sourceBytes)

    const revokeResponse = await fetch(`${mesOrigin}/api/attachments/${attachment.id}/office-view-session?sessionId=${sessionBody.data!.id}`, {
      method: 'DELETE', headers: { Cookie: cookie, Origin: mesOrigin },
    })
    assert.equal(revokeResponse.status, 200)
    const revokedResponse = await fetch(checkUrl, { headers: proofHeaders(currentKey.privateKey, wopiToken, checkUrl) })
    assert.equal(revokedResponse.status, 401, '撤销后的 WOPI 令牌必须立即失效')

    console.log('WOPI HTTP integration verification passed')
  } finally {
    nextProcess?.kill('SIGTERM')
    if (discoveryServer) await new Promise<void>((resolve) => discoveryServer!.close(() => resolve()))
    await prisma?.$disconnect()
    await rm(verifyRoot, { recursive: true, force: true })
  }
}

void main()
