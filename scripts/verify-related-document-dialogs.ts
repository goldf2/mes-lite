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
assert.match(sharedDialog, /不关联销售订单/, '发货单创建必须完全独立于销售订单')
assert.match(sharedDialog, /customerId/, '独立发货必须选择客户')
assert.match(sharedDialog, /materialId/, '独立发货必须选择物料')
assert.match(sharedDialog, /onCreated/, '创建成功后必须通知来源页面刷新')
assert.match(shipmentPage, /<ShipmentCreateDialog/, '发货管理必须复用公共发货单创建弹窗')
assert.doesNotMatch(salesOrderPage, /ShipmentCreateDialog/, '销售订单不得直接创建发货单')
assert.doesNotMatch(salesOrderPage, /生成发货单/, '销售订单不得保留自动派生发货单按钮')
assert.doesNotMatch(homeApp, /onOpenShipment=\{\(\) => navigateToTab\('shipment'\)\}/, '跨页面生成发货单不应再跳转页面')
assert.match(salesOrderPage, /VisibleFieldControl/, '销售订单列表必须允许用户选择可见项')
assert.match(shipmentPage, /VisibleFieldControl/, '发货单列表必须允许用户选择可见项')
assert.match(salesOrderPage, /primaryImage/, '销售订单必须支持按需显示物料图片')
assert.match(shipmentPage, /primaryImage/, '发货单必须支持按需显示物料图片')
assert.doesNotMatch(shipmentPage, /来源销售订单/, '发货单列表不得展示销售订单来源')

console.log('单据边界验证通过：发货在独立模块创建，销售订单与发货单完全解耦。')
