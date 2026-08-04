import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  DocumentContentValidationError,
  normalizeDocumentContent,
} from '../lib/document-content'

const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-docs-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`

execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' },
  stdio: 'pipe',
})

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const normalized = normalizeDocumentContent(JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'P12 切管参数' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '送料速度 80 mm/s' }] },
      ],
    }))
    assert.equal(normalized.contentText, 'P12 切管参数\n送料速度 80 mm/s')
    assert.throws(() => normalizeDocumentContent('{bad json'), DocumentContentValidationError)

    const category = await prisma.documentCategory.create({ data: { name: '验证指导书' } })
    const document = await prisma.workInstruction.create({
      data: {
        title: 'P12 切管机参数操作指导书',
        categoryId: category.id,
        materialId: null,
        ...normalized,
      },
    })

    assert.equal(document.materialId, null)
    assert.equal(document.contentText, 'P12 切管参数\n送料速度 80 mm/s')
    assert.ok(document.contentJson?.includes('heading'))

    console.log('在线文档结构化正文、搜索文本与可选产品关联验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
