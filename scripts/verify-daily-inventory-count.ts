import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const required = [
  'modules/inventory/ui/DailyInventoryCountPage.tsx',
  'app/api/stocks/daily-count/route.ts',
]
for (const path of required) assert.ok(existsSync(join(root, path)), `生产日报快捷盘点缺少文件：${path}`)

const page = read(required[0])
const route = read(required[1])
const client = read('modules/inventory/client/stock-api.ts')
const command = read('modules/inventory/server/stock-command-service.ts')
const registry = read('lib/page-registry.ts')
const workspace = read('lib/workspace.ts')
const legacyCommand = read('modules/production/server/legacy-daily-production-command-service.ts')

assert.doesNotMatch(page, /\bfetch\(/, '生产日报页面必须复用库存领域 client')
assert.match(page, /submitDailyInventoryCount/, '生产日报页面必须整单提交盘点差异')
assert.match(page, /不要求生产人员、设备、工序或质量作业/, '页面必须说明快捷盘点的业务边界')
assert.match(page, /FIFO 物料以及含待检、冻结、返工库存/, '页面必须保留成本与质量状态保护提示')
assert.match(route, /requireResourcePermission\('stocks', 'update'\)/, '生产日报过账必须使用库存更新权限')
assert.match(route, /reconcileDailyInventory\(/, '生产日报 API 必须委托库存领域命令服务')
assert.doesNotMatch(route, /prisma\./, '生产日报 API 不得直接访问数据库')
assert.match(command, /prisma\.\$transaction[\s\S]*postStockLocationAdjustment/, '生产日报整单必须在单事务内复用库存调整规则')
assert.match(command, /unchangedCount/, '生产日报必须跳过账实一致行')
assert.match(command, /action: 'RECONCILE'/, '生产日报差异必须写入可识别审计动作')
assert.match(command, /consumeAvailableInventoryLotsForReference/, '盘亏必须同步扣减内部批次余额')
assert.match(command, /createInventoryLotReceipt/, '盘盈必须建立可追溯的盘点批次')
assert.match(client, /export async function submitDailyInventoryCount/, '库存 client 必须封装生产日报提交')
assert.match(registry, /key: 'dailyInventory'[\s\S]*title: '生产日报'/, '页面注册表必须发布生产日报入口')
assert.match(workspace, /'dailyInventory'/, '默认工作台必须提供生产日报快捷入口')
assert.match(legacyCommand, /createLegacyDailyProductionReport[\s\S]*410/, '新快捷盘点不得恢复旧生产日报写入')
assert.doesNotMatch(command, /dailyProductionReport\.create|qualityInspection\.create/, '库存盘点服务不得伪造生产或质量记录')

console.log('生产日报快捷盘点页面、权限、整单事务、库存流水审计、工作台入口及生产质量隔离验证通过')
