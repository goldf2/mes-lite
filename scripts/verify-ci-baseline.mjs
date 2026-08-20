import { spawnSync } from 'node:child_process'

const checks = [
  'verify:docker-deps',
  'verify:release-tree',
  'verify:module-boundaries',
  'verify:structural-goal',
  'verify:model-convergence',
  'verify:product-material-migration',
  'verify:stock-owner-invariant',
  'verify:equipment',
  'verify:equipment-events-http',
  'verify:equipment-inspections',
  'verify:equipment-inspections-http',
  'verify:equipment-maintenance',
  'verify:equipment-maintenance-http',
  'verify:permissions',
  'verify:role-task-http-permissions',
  'verify:fine-grained-http-permissions',
  'verify:archive-resource-permissions',
  'verify:data-scopes',
  'verify:data-scope-http',
  'verify:production-actual-context',
  'verify:production-quality-lots',
  'verify:inventory-lot-genealogy',
  'verify:shipment-return-lots',
  'verify:quality-dispositions',
  'verify:quality-inspection-standards',
  'verify:quality-inspection-standards-http',
  'verify:incoming-quality-inspections',
  'verify:incoming-quality-inspections-http',
  'verify:mutation-audit-coverage',
  'verify:inventory-transaction-ledger',
  'verify:runtime-operations',
  'verify:attachment-storage',
  'verify:cad-preview',
  'verify:libredwg-cad-preview',
  'verify:wopi-viewer',
  'verify:wopi-http',
  'verify:production-database-audit',
  'verify:production-schema-drift',
  'verify:sop',
  'verify:sop-fullscreen-help',
  'verify:sop-release',
  'verify:sop-library-publication',
  'verify:release-notes',
  'verify:development-docs',
]

for (const check of checks) {
  console.log(`\n[ci] ${check}`)
  const startedAt = Date.now()
  const result = spawnSync('npm', ['run', check], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const exitCode = result.status ?? 1
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
    const message = `${check} 失败：退出码 ${exitCode}，用时 ${elapsedSeconds}s`
    console.error(`\n[ci] ${message}`)
    if (process.env.GITHUB_ACTIONS === 'true') {
      const escapeWorkflowCommand = (value) => String(value)
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A')
      console.error(`::error title=MES-lite CI 子检查失败::${escapeWorkflowCommand(message)}`)
    }
    process.exit(exitCode)
  }
}

console.log(`\nCI 领域基线通过：${checks.length} 项。`)
