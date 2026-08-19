import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AttachmentDomainError } from '../modules/attachments/domain/attachment-errors'
import {
  normalizeWopiActionUrl,
  parseWopiDiscovery,
} from '../modules/attachments/server/wopi-discovery-service'
import {
  buildWopiProofExpectedValue,
  verifyWopiProof,
} from '../modules/attachments/server/wopi-proof-service'

const root = process.cwd()
const dotNetEpochTicks = BigInt('621355968000000000')
const nowTicks = dotNetEpochTicks + BigInt(Date.now()) * BigInt(10000)

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

async function main() {
const current = discoveryKey()
const old = discoveryKey()
const discovery = parseWopiDiscovery(`<?xml version="1.0"?>
<wopi-discovery>
  <net-zone name="external-https">
    <app name="calc">
      <action name="edit" ext="xlsx" urlsrc="https://office.example.com/browser/hash/cool.html?&amp;&lt;ui=UI_LLCC&amp;&gt;&amp;" />
      <action name="view" ext="xls" urlsrc="https://office.example.com/browser/hash/cool.html?" />
    </app>
  </net-zone>
  <proof-key modulus="${current.modulus}" exponent="${current.exponent}" oldmodulus="${old.modulus}" oldexponent="${old.exponent}" />
</wopi-discovery>`)

assert.equal(discovery.actions.get('xlsx')?.edit, 'https://office.example.com/browser/hash/cool.html?&<ui=UI_LLCC&>&')
assert.equal(discovery.actions.get('xls')?.view, 'https://office.example.com/browser/hash/cool.html?')
assert.throws(
  () => parseWopiDiscovery('<!DOCTYPE data [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><wopi-discovery/>'),
  AttachmentDomainError,
  '发现文档不得允许 DTD 或外部实体',
)

const actionUrl = normalizeWopiActionUrl(discovery.actions.get('xlsx')?.edit || '')
assert.equal(actionUrl.origin, 'https://office.example.com')
assert.doesNotMatch(actionUrl.toString(), /UI_LLCC/, '未使用的 discovery 模板参数不得进入浏览器 URL')

const accessToken = 'verification-token'
const requestUrl = 'https://mes.example.com/api/wopi/files/attachment-1?access_token=verification-token'
const expected = buildWopiProofExpectedValue(accessToken, requestUrl, nowTicks)
const proof = sign('RSA-SHA256', expected, current.privateKey).toString('base64')
await verifyWopiProof(new Request(requestUrl, { headers: {
  'X-WOPI-TimeStamp': nowTicks.toString(),
  'X-WOPI-Proof': proof,
} }), accessToken, requestUrl, discovery)

await assert.rejects(
  () => verifyWopiProof(new Request(requestUrl, { headers: {
    'X-WOPI-TimeStamp': nowTicks.toString(),
    'X-WOPI-Proof': Buffer.from('invalid').toString('base64'),
  } }), accessToken, requestUrl, discovery),
  (error: unknown) => error instanceof AttachmentDomainError && error.status === 500,
  '无效 WOPI 请求签名必须被拒绝',
)

const staleTicks = dotNetEpochTicks + BigInt(Date.now() - 21 * 60 * 1000) * BigInt(10000)
await assert.rejects(
  () => verifyWopiProof(new Request(requestUrl, { headers: {
    'X-WOPI-TimeStamp': staleTicks.toString(),
    'X-WOPI-Proof': proof,
  } }), accessToken, requestUrl, discovery),
  (error: unknown) => error instanceof AttachmentDomainError && /过期/.test(error.message),
  '超过 20 分钟的 WOPI 请求签名必须被拒绝',
)

const middlewareSource = readFileSync(join(root, 'middleware.ts'), 'utf8')
const viewerSource = readFileSync(join(root, 'modules/attachments/ui/SpreadsheetDocumentViewer.tsx'), 'utf8')
const documentViewerSource = readFileSync(join(root, 'modules/attachments/ui/DocumentFileViewer.tsx'), 'utf8')
const viewServiceSource = readFileSync(join(root, 'modules/attachments/server/wopi-view-service.ts'), 'utf8')
const checkFileInfoSource = readFileSync(join(root, 'app/api/wopi/files/[id]/route.ts'), 'utf8')
const getFileSource = readFileSync(join(root, 'app/api/wopi/files/[id]/contents/route.ts'), 'utf8')
const migrationSource = readFileSync(join(root, 'prisma/migrations/20260819130000_add_wopi_view_sessions/migration.sql'), 'utf8')

assert.match(middlewareSource, /pathname\.startsWith\('\/api\/wopi\/'\)/, 'WOPI 回调必须绕过浏览器 Cookie 中间件并在接口内验证令牌')
assert.match(viewerSource, /name="access_token"/, 'Collabora 令牌必须通过表单 POST 提交')
assert.match(viewerSource, /使用兼容 PDF 预览/, '在线查看失败时必须保留用户主动选择的兼容预览')
assert.match(viewerSource, /reason\.status === 503[\s\S]*未配置/, '未配置 Collabora 时必须自动保留既有 PDF 体验')
assert.match(documentViewerSource, /SpreadsheetDocumentViewer/, '公共附件查看器必须统一接入在线表格查看器')
assert.match(viewServiceSource, /requireManagedAttachmentAccessForOperator/, '每次 WOPI 读取必须重新校验附件业务权限')
assert.match(viewServiceSource, /randomBytes\(32\)/, 'WOPI 查看令牌必须使用高强度随机值')
assert.match(checkFileInfoSource, /ReadOnly: true/, 'CheckFileInfo 必须声明严格只读')
assert.match(checkFileInfoSource, /SupportsUpdate: false/, '只读阶段不得声明文件更新能力')
assert.match(getFileSource, /Readable\.toWeb\(createReadStream/, 'WOPI GetFile 必须流式读取原始附件')
assert.match(migrationSource, /"tokenHash" TEXT NOT NULL/, '数据库只能持久化 WOPI 令牌哈希')

console.log('WOPI spreadsheet viewer verification passed')
}

void main()
