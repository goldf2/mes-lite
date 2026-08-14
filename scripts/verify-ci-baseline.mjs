import { spawnSync } from 'node:child_process'

const checks = [
  'verify:docker-deps',
  'verify:module-boundaries',
  'verify:structural-goal',
  'verify:model-convergence',
  'verify:product-material-migration',
  'verify:equipment',
  'verify:equipment-events-http',
  'verify:equipment-inspections',
  'verify:equipment-inspections-http',
  'verify:permissions',
  'verify:role-task-http-permissions',
  'verify:fine-grained-http-permissions',
  'verify:archive-resource-permissions',
  'verify:data-scopes',
  'verify:data-scope-http',
  'verify:production-quality-lots',
  'verify:inventory-lot-genealogy',
  'verify:shipment-return-lots',
  'verify:quality-dispositions',
  'verify:runtime-operations',
  'verify:attachment-storage',
  'verify:production-database-audit',
  'verify:sop',
  'verify:sop-fullscreen-help',
  'verify:release-notes',
  'verify:development-docs',
]

for (const check of checks) {
  console.log(`\n[ci] ${check}`)
  const result = spawnSync('npm', ['run', check], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`\nCI 领域基线通过：${checks.length} 项。`)
