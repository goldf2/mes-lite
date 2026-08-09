import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const sharedDialog = read('modules/sales/ui/ShipmentCreateDialog.tsx')
const shipmentPage = read('modules/sales/ui/ShipmentPageModule.tsx')
const salesOrderPage = read('modules/sales/ui/SalesOrderPageModule.tsx')
const homeApp = read('app/HomeApp.tsx')

assert.match(sharedDialog, /<ModalDialog/, '发货单创建必须使用公共弹窗骨架')
assert.match(sharedDialog, /不关联销售订单（独立发货）/, '发货单创建必须允许不关联销售订单')
assert.match(sharedDialog, /customerId/, '独立发货必须选择客户')
assert.match(sharedDialog, /materialId/, '独立发货必须选择物料')
assert.match(sharedDialog, /onCreated/, '创建成功后必须通知来源页面刷新')
assert.match(shipmentPage, /<ShipmentCreateDialog/, '发货管理必须复用公共发货单创建弹窗')
assert.doesNotMatch(salesOrderPage, /ShipmentCreateDialog/, '销售订单不得直接创建发货单')
assert.doesNotMatch(salesOrderPage, /生成发货单/, '销售订单不得保留自动派生发货单按钮')
assert.doesNotMatch(homeApp, /onOpenShipment=\{\(\) => navigateToTab\('shipment'\)\}/, '跨页面生成发货单不应再跳转页面')

console.log('单据边界验证通过：发货在独立模块创建、来源订单可选，销售订单不再直接派生发货单。')
