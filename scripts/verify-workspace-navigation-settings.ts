import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const verifyRoot = mkdtempSync(join(tmpdir(), 'mes-lite-workspace-navigation-'))
const databaseUrl = `file:${join(verifyRoot, 'verify.db')}`
process.env.DATABASE_URL = databaseUrl
execFileSync('/usr/bin/sqlite3', [join(verifyRoot, 'verify.db'), `
  CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
  );
`], { stdio: 'pipe' })

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

async function main() {
  try {
    const { getWorkspaceNavigationConfig, saveWorkspaceNavigationConfig } = await import('../lib/workspace-navigation-settings')
    const defaults = await getWorkspaceNavigationConfig(prisma)
    assert.equal(defaults.defaultWorkspace, 'mes')

    defaults.defaultWorkspace = 'mrp'
    defaults.workspaces.mrp.groupOrder = [
      'system',
      ...defaults.workspaces.mrp.groupOrder.filter((groupKey) => groupKey !== 'system'),
    ]
    defaults.workspaces.mes.items = defaults.workspaces.mes.items.filter((item) => item.functionKey !== 'orders')
    const order = defaults.workspaces.mrp.items
    defaults.workspaces.mrp.items = [
      { functionKey: 'orders', label: '计划订单' },
      ...order.filter((item) => item.functionKey !== 'orders'),
    ]
    await saveWorkspaceNavigationConfig(defaults, prisma)

    const saved = await getWorkspaceNavigationConfig(prisma)
    assert.equal(saved.defaultWorkspace, 'mrp')
    assert.equal(saved.workspaces.mrp.groupOrder[0], 'system')
    assert.deepEqual(saved.workspaces.mrp.items[0], { functionKey: 'orders', label: '计划订单' })
    assert.equal(saved.workspaces.mes.items.some((item) => item.functionKey === 'orders'), false)
    assert.equal(await prisma.systemSetting.count({ where: { key: 'interface.workspaceNavigation.v1' } }), 1)
    console.log('工作区一级菜单顺序、页面唯一归属、别名和页面顺序数据库持久化验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
