import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = path.join(root, '.runtime', 'bom-workbench')
mkdirSync(runtime, { recursive: true })
const database = path.join(runtime, 'development.db')
// Always pin the sandbox DB and built-in auth; never inherit production configuration.
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'development', DATABASE_URL: `file:${database}`,
  APP_LOGIN_MODE: 'builtin', BOM_WORKBENCH_ENABLED: '1',
  NEXT_TELEMETRY_DISABLED: '1',
}
function run(binary, args) {
  const result = spawnSync(path.join(root, 'node_modules', '.bin', binary), args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
if (process.argv[2] === 'init') {
  run('prisma', ['migrate', 'deploy'])
  if (!existsSync(path.join(runtime, 'account-initialized'))) {
    run('tsx', ['scripts/ensure-dev-admin.ts'])
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path.join(runtime, 'account-initialized'), 'Local sandbox admin initialized.\n')
  }
  run('tsx', ['scripts/seed-bom-workbench.ts'])
  console.log('BOM sandbox ready. Local account: admin / admin123. Run npm run bom:dev.')
} else if (process.argv[2] === 'dev') {
  if (!existsSync(database)) throw new Error('Run npm run bom:init first')
  console.log('BOM workspace: http://127.0.0.1:3107/bom-workbench')
  const child = spawn(path.join(root, 'node_modules', '.bin', 'next'), ['dev', '--hostname', '127.0.0.1', '--port', '3107'], { cwd: root, env, stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', error => { console.error(error); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code || 0 })
} else throw new Error('Usage: node scripts/bom-workbench.mjs init|dev')
