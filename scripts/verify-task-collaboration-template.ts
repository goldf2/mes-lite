import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = process.cwd()
const directory = mkdtempSync(join(tmpdir(), 'ml-task-template-'))
const databaseUrl = `file:${join(directory, 'verify.db')}`
process.env.DATABASE_URL = databaseUrl
execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, stdio: 'pipe' })
async function main() {
  const [{ prisma }, { createTask, assignTask, appendTaskProgress }, { unrestrictedDataScope }] = await Promise.all([
    import('../lib/prisma'), import('../modules/task-collaboration/server/task-command-service'), import('../modules/identity-access'),
  ])
  try {
    const actor = { id: 'synthetic-template-admin', username: 'synthetic-template-admin', name: '合成模板测试管理员', role: 'ADMIN' }
    const scope = { ...unrestrictedDataScope, operatorId: actor.id }
    const audit = { operatorId: actor.id, operatorName: actor.name }
    const material = await prisma.material.create({ data: { code: 'TEMPLATE-M', name: '模板测试物料', unit: '件' } })
    const employee = await prisma.employee.create({ data: { code: 'TEMPLATE-E', name: '模板测试员工' } })
    const base = { title: '模板来源', quantity: 2, unit: '件', instructions: '每次固定要求', documentRefs: [], lines: [{ materialId: material.id, quantity: 3, unit: '件', documentRefs: [] }], assigneeEmployeeId: employee.id }
    let source = await createTask(base, actor, scope, audit)
    source = await assignTask(source.id, { expectedRevision: source.revision }, actor, scope, audit)
    source = await appendTaskProgress(source.id, { kind: 'NOTE', note: '来源执行记录', attachmentRefs: [] }, actor, scope, audit)
    const inherited = await createTask({ title: '独立新任务', quantity: 7, unit: '件', documentRefs: [], lines: [], templateTaskId: source.id }, actor, scope, audit, { instructions: true, lines: true, documentRefs: true })
    assert.equal(inherited.instructions, base.instructions)
    assert.equal(inherited.lines.length, 1)
    assert.equal(inherited.lines[0].quantity, 3)
    assert.notEqual(inherited.lines[0].id, source.lines[0].id)
    assert.equal(inherited.quantity, 7)
    assert.equal(inherited.status, 'DRAFT')
    assert.equal(inherited.assigneeEmployeeId, null)
    assert.equal(inherited.progress.length, 0)
    assert.equal(inherited.releases.length, 0)
    const cleared = await createTask({ title: '显式清空模板内容', quantity: 1, unit: '件', instructions: null, documentRefs: [], lines: [], templateTaskId: source.id }, actor, scope, audit, { instructions: false, lines: false, documentRefs: false })
    assert.equal(cleared.instructions, null)
    assert.equal(cleared.lines.length, 0)
    assert.equal((await prisma.taskCollaboration.findUniqueOrThrow({ where: { id: source.id } })).quantity, 2)
    console.log('任务模板验证通过：固定要求继承、显式空值保留、数量独立、BOM行新身份、执行及历史不复制。')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => rmSync(directory, { recursive: true, force: true }))
