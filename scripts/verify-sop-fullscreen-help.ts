import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const drawer = read('modules/sop/ui/SopHelpDrawer.tsx')
const page = read('app/help/page.tsx')
const center = read('modules/sop/ui/SopHelpCenterPage.tsx')

assert.match(drawer, /target="_blank"/, '快捷帮助必须在新页面打开全屏帮助')
assert.match(drawer, /\/help\?pageKey=/, '新页面必须携带当前页面定位参数')
assert.match(drawer, /href="\/help" target="_blank"/, '完整帮助中心也必须在新页面打开')
assert.equal((drawer.match(/target="_blank"/g) || []).length, 2, '快捷帮助底部两个入口都必须打开新页面')
assert.match(drawer, /noopener noreferrer/, '新页面链接必须隔离 opener')
assert.match(page, /getCurrentOperator/, '全屏帮助页面必须要求登录会话')
assert.match(page, /redirect\('\/'\)/, '未登录访问全屏帮助必须返回登录入口')
assert.match(center, /useSopCatalog\(pageKey\)/, '全屏帮助必须沿用服务端权限过滤后的同源 SOP')

console.log('SOP 全屏帮助验证通过：登录保护、当前页面定位、同源权限过滤和新页隔离均符合要求。')
