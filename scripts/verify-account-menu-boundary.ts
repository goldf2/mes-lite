import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'app/HomeApp.tsx'), 'utf8')
const menuSource = readFileSync(resolve(process.cwd(), 'app/components/shell/AccountMenu.tsx'), 'utf8')

assert.match(source, /<AccountMenu\b/, '应用壳必须使用公共账号菜单组件')
assert.doesNotMatch(menuSource, /items\.map|items:\s*Array|onNavigate/, '账号菜单不得包含人员与权限管理入口')
assert.match(menuSource, /OperatorBadge/, '账号菜单必须显示当前账号身份')
assert.match(menuSource, /MES-lite v\{appVersion\}/, '账号菜单必须显示当前版本')
assert.match(menuSource, /退出登录/, '账号菜单必须保留退出登录')

assert.match(source, /id:\s*'account'[\s\S]*?items:\s*readableSystemNavItems\.map/, '账号与权限管理必须保留在一级导航中')

console.log('账号菜单边界验证通过：只显示账号信息、版本和退出登录，管理功能保留在一级导航。')
