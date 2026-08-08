import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const sharedDialog = read('app/components/ShipmentCreateDialog.tsx')
const shipmentPage = read('app/components/ShipmentPage.tsx')
const salesOrderPage = read('app/components/SalesOrderPage.tsx')
const homeApp = read('app/HomeApp.tsx')

assert.match(sharedDialog, /<ModalDialog/, '发货单创建必须使用公共弹窗骨架')
assert.match(sharedDialog, /initialSalesOrderId/, '跨页面生成发货单必须支持预选销售订单')
assert.match(sharedDialog, /onCreated/, '创建成功后必须通知来源页面刷新')
assert.match(shipmentPage, /<ShipmentCreateDialog/, '发货管理必须复用公共发货单创建弹窗')
assert.match(salesOrderPage, /<ShipmentCreateDialog/, '销售订单必须在当前页面弹出发货单创建窗口')
assert.match(salesOrderPage, /onClick=\{\(\) => setShipmentOrderId\(order\.id\)\}/, '销售订单必须把当前订单传入发货单弹窗')
assert.doesNotMatch(homeApp, /onOpenShipment=\{\(\) => navigateToTab\('shipment'\)\}/, '跨页面生成发货单不应再跳转页面')

console.log('关联单据弹窗验证通过：销售订单与发货管理复用发货单创建弹窗，并支持来源订单预选。')
