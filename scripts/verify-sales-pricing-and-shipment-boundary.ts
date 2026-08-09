import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const schema = read('prisma/schema.prisma')
const migration = read('prisma/migrations/20260809113000_add_material_sales_price/migration.sql')
const pricingRule = read('modules/sales/domain/sales-order-pricing.ts')
const salesCommand = read('modules/sales/server/sales-order-command-service.ts')
const fulfillmentSchema = read('modules/sales/contracts/fulfillment-schema.ts')
const fulfillmentCommand = read('modules/sales/server/fulfillment-command-service.ts')
const shipmentApi = read('app/api/shipments/route.ts')
const salesPage = read('modules/sales/ui/SalesOrderPageModule.tsx')
const shipmentDialog = read('modules/sales/ui/ShipmentCreateDialog.tsx')
const shippableApi = read('app/api/sales-orders/shippable/route.ts')

assert.match(schema, /defaultSalePrice\s+Float\?/, '物料必须提供可空默认销售价')
assert.doesNotMatch(schema.match(/model Material \{[\s\S]*?\n\}/)?.[0] || '', /costPrice|defaultCost/, '物料主数据不得增加默认成本价字段')
assert.match(schema, /defaultSalePriceSnapshot\s+Float\?/, '销售明细必须冻结默认销售价快照')
assert.match(schema, /priceAdjustedAt\s+DateTime\?/, '销售明细必须记录调价时间')
assert.match(migration, /ALTER TABLE "Material" ADD COLUMN "defaultSalePrice"/, '迁移必须增加物料默认销售价')
assert.match(pricingRule, /priceSource: defaultSalePrice/, '创建订单必须在领域规则中判定默认价或手工价来源')
assert.match(pricingRule, /defaultSalePriceSnapshot: defaultSalePrice/, '创建订单必须在领域规则中保存默认价快照')
assert.match(salesCommand, /订单已经产生发货记录，价格已锁定/, '产生发货记录后必须锁定订单价格')
assert.match(salesCommand, /action: 'ADJUST_PRICE'/, '调价必须在同一事务中写入审计日志')
assert.match(salesPage, /调整价格/, '销售订单页面必须提供受控调价入口')
assert.doesNotMatch(salesPage, /生成发货单/, '销售订单页面不得直接派生发货单')
assert.match(fulfillmentSchema, /salesOrderItemId: z\.string\(\)\.optional/, '发货来源订单必须是可选关系')
assert.match(fulfillmentCommand, /salesOrderId: null/, '独立发货必须明确保存空销售来源')
assert.match(fulfillmentCommand, /defaultSalePrice/, '独立发货必须调用物料默认销售价')
assert.match(shipmentApi, /createManagedShipment/, '发货路由必须通过领域命令服务创建单据')
assert.doesNotMatch(shipmentApi, /@\/lib\/prisma|\bprisma\./, '发货路由不得直接访问 Prisma')
assert.match(shipmentDialog, /不关联销售订单（独立发货）/, '发货界面必须提供独立发货选择')
assert.match(shippableApi, /requireResourcePermission\('shipment', 'create'\)/, '发货选项必须只依赖发货创建权限')
assert.match(shippableApi, /listShippableSalesOrderItems/, '发货选项接口必须通过领域查询服务提供客户与物料')

console.log('销售价与发货边界验证通过：默认价快照、受控调价、独立发货及无物料成本价字段均已落实。')
