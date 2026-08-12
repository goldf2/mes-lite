import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { documentRecognitionInputSchema } from '../modules/attachments/contracts/document-recognition'
import { extractRecognitionJson, normalizeRecognitionResult } from '../modules/attachments/domain/document-recognition'

const root = process.cwd()
const route = readFileSync(join(root, 'app/api/ai/document-recognition/route.ts'), 'utf8')
const service = readFileSync(join(root, 'modules/attachments/server/document-recognition-service.ts'), 'utf8')
assert.ok(route.split('\n').length <= 50, 'AI 文档识别 API 必须保持为不超过 50 行的 HTTP 适配层')
assert.doesNotMatch(route, /@\/lib\/prisma|\bprisma\.|readFile\(|ensureAttachmentThumbnail\(|\bfetch\(/, 'AI 文档识别 API 不得承载数据库、文件或 Provider 调用')
assert.match(service, /requireManagedAttachmentAccessForOperator/, '识别服务必须校验附件记录和所属业务权限')
assert.match(service, /AI_DOCUMENT_OWNER_MISMATCH/, '识别服务必须校验附件所有者')
assert.match(service, /AbortController/, '识别服务必须保留 Provider 超时控制')
assert.equal(documentRecognitionInputSchema.safeParse({ attachmentId: '', ownerType: '', ownerId: '' }).success, false)

const parsed = extractRecognitionJson('```json\n{"fields":{"voucherNo":"SO-1","note":"待确认"},"confidence":{"voucherNo":0.9,"note":0.6},"unrecognized":["customer"]}\n```')
const result = normalizeRecognitionResult(parsed)
assert.deepEqual(result.autoFilledFields, { voucherNo: 'SO-1' }, '仅高置信字段允许自动回填')
assert.deepEqual(result.unrecognized, ['customer'])
assert.throws(() => extractRecognitionJson('[]'))
console.log('AI 文档识别模块验证通过：薄路由、附件所有权、Provider 超时和高置信度纯规则边界完整。')
