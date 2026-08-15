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
    assert.equal(defaults.workspaces.mrp.enabled, false)
    assert.equal(defaults.workspaces.erp.enabled, false)
    assert.equal(defaults.moduleButtons.mes.label, 'MES-lite')
    assert.equal(defaults.moduleButtons.mrp.visible, true)

    defaults.workspaces.mes.groupOrder = [
      'system',
      ...defaults.workspaces.mes.groupOrder.filter((groupKey) => groupKey !== 'system'),
    ]
    defaults.workspaces.mes.items = [
      { functionKey: 'orders', label: '生产任务' },
      ...defaults.workspaces.mes.items.filter((item) => item.functionKey !== 'orders'),
    ]
    defaults.moduleButtons.mes.label = '制造中心'
    defaults.moduleButtons.mrp.visible = false
    defaults.moduleButtons.erp.label = '经营协同'
    await saveWorkspaceNavigationConfig(defaults, prisma)

    const saved = await getWorkspaceNavigationConfig(prisma)
    assert.equal(saved.defaultWorkspace, 'mes')
    assert.equal(saved.workspaces.mes.groupOrder[0], 'system')
    assert.deepEqual(saved.workspaces.mes.items[0], { functionKey: 'orders', label: '生产任务' })
    assert.equal(saved.workspaces.mes.items.some((item) => item.functionKey === 'bomUsage'), true)
    assert.equal(saved.workspaces.mes.items.some((item) => item.functionKey === 'salesOrders'), true)
    assert.deepEqual(saved.workspaces.mrp.items, [])
    assert.deepEqual(saved.workspaces.erp.items, [])
    assert.deepEqual(saved.moduleButtons, {
      mes: { visible: true, label: '制造中心' },
      mrp: { visible: false, label: 'MRP' },
      erp: { visible: true, label: '经营协同' },
    })
    assert.equal(await prisma.systemSetting.count({ where: { key: 'interface.workspaceNavigation.v1' } }), 1)
    console.log('统一 MES 工作台模块按钮、菜单顺序、别名和历史配置兼容持久化验证通过')
  } finally {
    await prisma.$disconnect()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
