import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const trustedActorRoutes = [
  'app/api/orders/[id]/actuals/[actualId]/confirm/route.ts',
  'app/api/orders/[id]/actuals/[actualId]/reverse/route.ts',
  'app/api/flow-transfers/[id]/confirm/route.ts',
  'app/api/flow-transfers/[id]/reverse/route.ts',
  'app/api/daily-production-reports/[id]/confirm/route.ts',
  'app/api/daily-production-reports/[id]/reverse/route.ts',
  'app/api/material-ins/[id]/receive/route.ts',
  'app/api/material-ins/[id]/reverse/route.ts',
  'app/api/shipments/[id]/ship/route.ts',
  'app/api/returns/[id]/process/route.ts',
  'app/api/orders/[id]/pick/route.ts',
  'app/api/orders/[id]/stock-in/route.ts',
  'app/api/costs/route.ts',
  'app/api/quality-inspections/[id]/decision/route.ts',
] as const

for (const path of trustedActorRoutes) {
  const source = read(path)
  assert.match(source, /getCurrentOperator/, `${path} 必须从服务端登录会话获取操作人`)
  assert.doesNotMatch(
    source,
    /input\.(confirmedBy|reversedBy|processedBy|createdBy)|(?:createdBy|confirmedBy|reversedBy|processedBy)\s*:\s*input\./,
    `${path} 不得信任客户端提交的审计身份`,
  )
}

for (const path of [
  'modules/production/contracts/production-order-actual-schema.ts',
  'modules/production/contracts/flow-transfer-schema.ts',
  'modules/production/contracts/legacy-daily-production-schema.ts',
  'modules/receiving/contracts/material-in-schema.ts',
  'modules/sales/contracts/fulfillment-schema.ts',
  'modules/production/contracts/production-cost-record-schema.ts',
  'modules/quality/contracts/quality-inspection-schema.ts',
]) {
  assert.doesNotMatch(
    read(path),
    /\b(confirmedBy|reversedBy|processedBy|createdBy)\s*:/,
    `${path} 的 HTTP 输入契约不得暴露审计身份字段`,
  )
}

const receivingStatus = read('modules/receiving/server/material-in-status-service.ts')
assert.match(receivingStatus, /receiveManagedMaterialIn\(id: string, receivedBy: string(?:,|\))/, '来料确认必须显式接收可信操作人')
assert.match(receivingStatus, /createdBy: receivedBy/, '来料库存流水必须记录可信操作人')

const salesStatus = read('modules/sales/server/fulfillment-status-service.ts')
assert.match(salesStatus, /shipManagedShipment\(id: string, shippedBy: string(?:,|\))/, '确认发货必须显式接收可信操作人')
assert.match(salesStatus, /createdBy: shippedBy/, '发货库存流水必须记录可信操作人')

console.log('可信操作人验证通过：确认、冲销、收货、发货、退货、兼容过账和成本记录均只使用服务端登录身份。')
